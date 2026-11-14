--!strict
-- Place in StarterPlayer > StarterPlayerScripts as Forge3DClient.client.lua.
-- The client sends only a description. It never sends or chooses a UserId.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local requestEvent = ReplicatedStorage:WaitForChild("Forge3DRequest") :: RemoteEvent
local statusEvent = ReplicatedStorage:WaitForChild("Forge3DStatus") :: RemoteEvent

local gui = Instance.new("ScreenGui")
gui.Name = "Forge3DGui"
gui.ResetOnSpawn = false
gui.Parent = player:WaitForChild("PlayerGui")

local frame = Instance.new("Frame")
frame.Name = "Panel"
frame.Size = UDim2.fromOffset(380, 220)
frame.Position = UDim2.new(0.5, -190, 0.75, -110)
frame.BackgroundColor3 = Color3.fromRGB(25, 28, 36)
frame.Parent = gui
Instance.new("UICorner", frame).CornerRadius = UDim.new(0, 12)

local title = Instance.new("TextLabel")
title.Size = UDim2.new(1, -24, 0, 32)
title.Position = UDim2.fromOffset(12, 8)
title.BackgroundTransparency = 1
title.Text = "Forge3D — Criar arma"
title.TextColor3 = Color3.new(1, 1, 1)
title.TextSize = 20
title.Font = Enum.Font.GothamBold
title.Parent = frame

local input = Instance.new("TextBox")
input.Size = UDim2.new(1, -24, 0, 90)
input.Position = UDim2.fromOffset(12, 48)
input.BackgroundColor3 = Color3.fromRGB(39, 44, 55)
input.TextColor3 = Color3.new(1, 1, 1)
input.PlaceholderColor3 = Color3.fromRGB(170, 175, 185)
input.PlaceholderText = "Descreva sua arma (8 a 1000 caracteres)"
input.Text = ""
input.TextWrapped = true
input.TextXAlignment = Enum.TextXAlignment.Left
input.TextYAlignment = Enum.TextYAlignment.Top
input.ClearTextOnFocus = false
input.TextSize = 14
input.Font = Enum.Font.Gotham
input.Parent = frame
Instance.new("UICorner", input).CornerRadius = UDim.new(0, 8)

local submit = Instance.new("TextButton")
submit.Size = UDim2.new(1, -24, 0, 34)
submit.Position = UDim2.fromOffset(12, 146)
submit.BackgroundColor3 = Color3.fromRGB(42, 125, 220)
submit.TextColor3 = Color3.new(1, 1, 1)
submit.Text = "Gerar arma"
submit.TextSize = 15
submit.Font = Enum.Font.GothamBold
submit.Parent = frame
Instance.new("UICorner", submit).CornerRadius = UDim.new(0, 8)

local status = Instance.new("TextLabel")
status.Size = UDim2.new(1, -24, 0, 28)
status.Position = UDim2.fromOffset(12, 184)
status.BackgroundTransparency = 1
status.Text = "Descreva sua arma."
status.TextColor3 = Color3.fromRGB(205, 210, 220)
status.TextSize = 12
status.TextWrapped = true
status.Font = Enum.Font.Gotham
status.Parent = frame

local busy = false
submit.Activated:Connect(function()
	if busy then return end
	local description = input.Text
	if #description < 8 or #description > 1000 then
		status.Text = "A descrição precisa ter entre 8 e 1000 caracteres."
		return
	end
	busy = true
	submit.Text = "Enviando..."
	requestEvent:FireServer(description)
end)

statusEvent.OnClientEvent:Connect(function(state: string, data: any)
	status.Text = data.message or state
	if state == "progress" then
		status.Text = string.format("Geração: %s (%s%%)", tostring(data.status), tostring(data.progress))
	end
	if state == "generated_package_ready" or state == "error" or state == "timeout" then
		busy = false
		submit.Text = "Gerar arma"
	end
end)
