--!strict
-- Place in ServerScriptService as Forge3DServer.server.lua.
-- Configure the experience Secret named FORGE3D_API_TOKEN and allow
-- https://server-roblox-create.vercel.app in Game Settings > Security.
-- Never put this token in a LocalScript, ReplicatedStorage, or client request.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local AssetService = game:GetService("AssetService")

local API_BASE = "https://server-roblox-create.vercel.app"
local UNIVERSE_ID = 10776153543
local MAX_DESCRIPTION_LENGTH = 1000
local PLAYER_COOLDOWN_SECONDS = 60
local POLL_INTERVAL_SECONDS = 3
local MAX_POLL_ATTEMPTS = 30

local apiToken = HttpService:GetSecret("FORGE3D_API_TOKEN")
local requestEvent = ReplicatedStorage:FindFirstChild("Forge3DRequest") or Instance.new("RemoteEvent")
requestEvent.Name = "Forge3DRequest"
requestEvent.Parent = ReplicatedStorage
local statusEvent = ReplicatedStorage:FindFirstChild("Forge3DStatus") or Instance.new("RemoteEvent")
statusEvent.Name = "Forge3DStatus"
statusEvent.Parent = ReplicatedStorage

local lastRequestAt: {[number]: number} = {}

local function requestApi(method: string, path: string, body: any?)
	local headers = {
		["Content-Type"] = "application/json",
		["x-forge-token"] = apiToken,
	}
	local response = HttpService:RequestAsync({
		Url = API_BASE .. path,
		Method = method,
		Headers = headers,
		Body = body and HttpService:JSONEncode(body) or nil,
	})
	if not response.Success then
		error(string.format("Forge3D HTTP %d: %s", response.StatusCode, response.Body))
	end
	return response.Body ~= "" and HttpService:JSONDecode(response.Body) or {}
end

local function sendStatus(player: Player, state: string, data: any?)
	if player.Parent == Players then
		statusEvent:FireClient(player, state, data or {})
	end
end

local function applyVisualEffects(model: Model, effects: any)
	if typeof(effects) ~= "table" then return end
	local targetPart: BasePart? = nil
	for _, descendant in ipairs(model:GetDescendants()) do
		if descendant:IsA("BasePart") and (not targetPart or descendant.Size.Y > targetPart.Size.Y) then
			targetPart = descendant
		end
	end
	if not targetPart then return end

	local attachment = targetPart:FindFirstChild("Forge3D_VFXAttachment") :: Attachment?
	if not attachment then
		attachment = Instance.new("Attachment")
		attachment.Name = "Forge3D_VFXAttachment"
		attachment.Parent = targetPart
	end

	if effects.fire == true and not attachment:FindFirstChild("Forge3D_GreenFire") then
		local fire = Instance.new("ParticleEmitter")
		fire.Name = "Forge3D_GreenFire"
		fire.Texture = "rbxasset://textures/particles/fire_main.dds"
		fire.Color = ColorSequence.new(Color3.fromRGB(40, 255, 35), Color3.fromRGB(150, 255, 90))
		fire.LightEmission = 1
		fire.Rate = 28
		fire.Lifetime = NumberRange.new(0.35, 0.8)
		fire.Speed = NumberRange.new(0.35, 1.1)
		fire.SpreadAngle = Vector2.new(18, 18)
		fire.Size = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.22), NumberSequenceKeypoint.new(1, 0)})
		fire.Transparency = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.12), NumberSequenceKeypoint.new(1, 1)})
		fire.Parent = attachment
	end

	if effects.aura == true then
		local light = targetPart:FindFirstChild("Forge3D_GreenAura") :: PointLight?
		if not light then
			light = Instance.new("PointLight")
			light.Name = "Forge3D_GreenAura"
			light.Color = Color3.fromRGB(45, 255, 35)
			light.Brightness = 1.6
			light.Range = 10
			light.Parent = targetPart
		end
		if not attachment:FindFirstChild("Forge3D_AuraParticles") then
			local aura = Instance.new("ParticleEmitter")
			aura.Name = "Forge3D_AuraParticles"
			aura.Texture = "rbxasset://textures/particles/sparkles_main.dds"
			aura.Color = ColorSequence.new(Color3.fromRGB(50, 255, 30), Color3.fromRGB(170, 255, 130))
			aura.LightEmission = 1
			aura.Rate = 14
			aura.Lifetime = NumberRange.new(0.6, 1.3)
			aura.Speed = NumberRange.new(0.15, 0.65)
			aura.SpreadAngle = Vector2.new(180, 180)
			aura.Size = NumberSequence.new({NumberSequenceKeypoint.new(0, 0.12), NumberSequenceKeypoint.new(1, 0)})
			aura.Parent = attachment
		end
	end
end

local function processWeaponRequest(player: Player, description: string)
	if typeof(description) ~= "string" then return end
	description = string.gsub(description, "^%s*(.-)%s*$", "%1")
	if #description < 8 or #description > MAX_DESCRIPTION_LENGTH then
		sendStatus(player, "error", {message = "A descrição deve ter entre 8 e 1000 caracteres."})
		return
	end

	local now = os.clock()
	local previous = lastRequestAt[player.UserId] or 0
	if now - previous < PLAYER_COOLDOWN_SECONDS then
		sendStatus(player, "error", {message = "Aguarde antes de solicitar outra arma."})
		return
	end
	lastRequestAt[player.UserId] = now

	sendStatus(player, "submitting", {message = "Enviando sua solicitação..."})
	local idempotencyKey = HttpService:GenerateGUID(false)
	local payload = {
		universe_id = UNIVERSE_ID,
		-- UserId comes from the server-side Player object, never from the client.
		player = {
			user_id = tostring(player.UserId),
			username = player.Name,
		},
		weapon_description = description,
		category = "melee.sword",
		style = "player_custom",
		constraints = {
			max_tris = 18000,
			quality = "high",
		},
		idempotency_key = idempotencyKey,
	}

	local ok, result = pcall(function()
		return requestApi("POST", "/v1/generate", payload)
	end)
	if not ok then
		warn("[Forge3D] create job failed:", result)
		sendStatus(player, "error", {message = "Não foi possível enviar a solicitação. Tente novamente mais tarde."})
		return
	end

	local jobId = result.job_id
	if typeof(jobId) ~= "string" then
		sendStatus(player, "error", {message = "A API não retornou um identificador de geração."})
		return
	end
	sendStatus(player, "queued", {job_id = jobId, message = "Solicitação recebida. Iniciando processamento..."})

	-- Best-effort immediate queue tick. The scheduled Cron remains the fallback.
	task.spawn(function()
		local triggerOk, triggerError = pcall(function()
			requestApi("POST", "/internal/process-queue")
		end)
		if not triggerOk then
			warn("[Forge3D] immediate worker trigger failed; scheduled worker may process it:", triggerError)
		end
	end)

	for attempt = 1, MAX_POLL_ATTEMPTS do
		if player.Parent ~= Players then return end
		task.wait(POLL_INTERVAL_SECONDS)
		local path = string.format(
			"/v1/jobs/%s?universe_id=%d&user_id=%s",
			jobId,
			UNIVERSE_ID,
			tostring(player.UserId)
		)
		local pollOk, job = pcall(function()
			return requestApi("GET", path)
		end)
		if not pollOk then
			warn("[Forge3D] status request failed:", job)
			sendStatus(player, "error", {message = "Falha ao consultar o progresso da geração."})
			return
		end

		sendStatus(player, "progress", {
			job_id = jobId,
			status = job.status,
			progress = job.progress or 0,
		})

		if job.status == "completed" then
			local assetId = tonumber(job.result and job.result.asset_id)
			local visualEffects = job.result and job.result.visual_effects
			if not assetId then
				warn("[Forge3D] completed job without Roblox asset_id:", jobId)
				sendStatus(player, "error", {message = "A geração terminou, mas o Roblox não retornou o ID do modelo."})
				return
			end

			local weaponsFolder = ReplicatedStorage:FindFirstChild("armas_AU")
			if not weaponsFolder then
				weaponsFolder = Instance.new("Folder")
				weaponsFolder.Name = "armas_AU"
				weaponsFolder.Parent = ReplicatedStorage
			end

			local existingModel = nil
			for _, item in ipairs(weaponsFolder:GetChildren()) do
				if item:GetAttribute("JobID") == jobId then
					existingModel = item
					break
				end
			end

			if not existingModel then
				local loadOk, loadedModel = pcall(function()
					return AssetService:LoadAssetAsync(assetId)
				end)
				if not loadOk or not loadedModel or not loadedModel:IsA("Model") then
					warn("[Forge3D] Roblox asset load failed:", loadedModel)
					sendStatus(player, "error", {message = "O modelo foi publicado, mas o Roblox não conseguiu carregá-lo no servidor.", asset_id = assetId, job_id = jobId})
					return
				end

				loadedModel.Name = "Arma_" .. string.sub(jobId, 1, 8)
				loadedModel:SetAttribute("UserID", player.UserId)
				loadedModel:SetAttribute("JobID", jobId)
				loadedModel:SetAttribute("AssetId", assetId)
				loadedModel.Parent = weaponsFolder
			end

			sendStatus(player, "generated_package_ready", {
				job_id = jobId,
				asset_id = assetId,
				message = "Arma publicada e salva em ReplicatedStorage > armas_AU."
			})
			return
		elseif job.status == "failed" or job.status == "cancelled" then
			sendStatus(player, "error", {message = "A geração não foi concluída.", job_id = jobId})
			return
		end
	end

	sendStatus(player, "timeout", {message = "A solicitação continua na fila. Consulte novamente mais tarde.", job_id = jobId})
end

requestEvent.OnServerEvent:Connect(function(player: Player, description: any)
	task.spawn(processWeaponRequest, player, description)
end)

Players.PlayerRemoving:Connect(function(player)
	lastRequestAt[player.UserId] = nil
end)
