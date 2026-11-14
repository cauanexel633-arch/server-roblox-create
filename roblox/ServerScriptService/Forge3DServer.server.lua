--!strict
-- Place in ServerScriptService as Forge3DServer.server.lua.
-- Configure the experience Secret named FORGE3D_API_TOKEN and allow
-- https://server-roblox-create.vercel.app in Game Settings > Security.
-- Never put this token in a LocalScript, ReplicatedStorage, or client request.

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

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
			local packageOk, packageData = pcall(function()
				return requestApi(
					"GET",
					string.format("/v1/weapons/%s/package?universe_id=%d&user_id=%s", jobId, UNIVERSE_ID, tostring(player.UserId))
				)
			end)
			if not packageOk then
				warn("[Forge3D] package lookup failed:", packageData)
				sendStatus(player, "error", {message = "A arma foi gerada, mas não foi possível obter o pacote."})
				return
			end

			-- The current backend returns private, short-lived GLB/OBJ/manifest URLs.
			-- Roblox cannot turn a GLB URL into a live Tool at runtime. A Roblox asset
			-- publishing/import pipeline is required before this final delivery step.
			sendStatus(player, "generated_package_ready", {
				job_id = jobId,
				message = "Modelo gerado. A etapa de publicação/importação como asset Roblox ainda precisa ser configurada.",
				artifact_kinds = (function()
					local kinds = {}
					for _, artifact in ipairs(packageData.artifacts or {}) do
						table.insert(kinds, artifact.kind)
					end
					return kinds
				end)(),
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
