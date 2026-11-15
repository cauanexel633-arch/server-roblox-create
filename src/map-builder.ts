import type { MapStudioPlan } from "./map-studio.js";

export type MapStudioPackage = {
  schema_version: "1.0";
  builder_luau: string;
  recovery_luau: string;
  manifest: { files: string[]; part_budget: number; safety: string[]; install: string[] };
};

function luaLongString(value: string): string {
  let equals = "";
  while (value.includes(`]${equals}] `.trim())) equals += "=";
  return `[${equals}[${value}]${equals}]`;
}

/** Compile a validated plan into native Roblox Luau scripts. No runtime mesh permission is required. */
export function compileMapStudioPackage(plan: MapStudioPlan): MapStudioPackage {
  const validation = validateForCompilation(plan);
  if (validation.length) throw new Error(`Map package rejected: ${validation.join(" ")}`);
  const encoded = luaLongString(JSON.stringify(plan));
  const builder = `-- Forge3D Map Studio | Generated builder
-- Execute this file once from Roblox Studio Command Bar.
-- It creates native Parts/Terrain, applies material/color settings and mandatory safety geometry.
local HttpService = game:GetService("HttpService")
local Workspace = game:GetService("Workspace")
local Terrain = Workspace.Terrain
local plan = HttpService:JSONDecode(${encoded})
local ROOT_NAME = "Forge3D_GeneratedMap"
local old = Workspace:FindFirstChild(ROOT_NAME)
if old then old:Destroy() end
local root = Instance.new("Folder")
root.Name = ROOT_NAME
root.Parent = Workspace

local function materialOf(name)
  local ok, value = pcall(function() return Enum.Material[name] end)
  return ok and value or Enum.Material.Concrete
end
local function colorOf(rgb)
  return Color3.fromRGB(
    math.floor(math.clamp((rgb[1] or 0.5) * 255, 0, 255)),
    math.floor(math.clamp((rgb[2] or 0.5) * 255, 0, 255)),
    math.floor(math.clamp((rgb[3] or 0.5) * 255, 0, 255))
  )
end
local function makePart(parent, name, position, size, materialName, color, shape)
  local part = Instance.new("Part")
  part.Name = tostring(name):sub(1, 80)
  part.Anchored = true
  part.CanCollide = true
  part.TopSurface = Enum.SurfaceType.Smooth
  part.BottomSurface = Enum.SurfaceType.Smooth
  part.Size = Vector3.new(math.max(0.5,size[1]), math.max(0.5,size[2]), math.max(0.5,size[3]))
  part.CFrame = CFrame.new(position[1], position[2], position[3])
  part.Material = materialOf(materialName)
  part.Color = colorOf(color)
  if shape == "sphere" then part.Shape = Enum.PartType.Ball
  elseif shape == "cylinder" then part.Shape = Enum.PartType.Cylinder end
  part.Parent = parent
  return part
end
local palette = plan.palette
local groundColor = palette.ground
local maxParts = math.clamp(plan.review.performance_budget.max_parts or 5000, 100, 50000)
local created = 0
local function add(parent, ...)
  if created >= maxParts then return nil end
  local part = makePart(parent, ...)
  created += 1
  return part
end

-- Main walkable surface; Terrain fill adds a natural substrate below the authored geometry.
add(root, "Map_Ground", {0, plan.bounds.min_y - 1, 0},
  {plan.bounds.width, 2, plan.bounds.depth}, "Grass", groundColor)
pcall(function()
  Terrain:FillBlock(CFrame.new(0, plan.bounds.min_y - 12, 0),
    Vector3.new(plan.bounds.width, 22, plan.bounds.depth), Enum.Material.Ground)
end)

-- Apply the texturizer's regional material/color choices.
local regionMaterials = {}
for _, entry in ipairs(plan.materials or {}) do
  regionMaterials[entry.region_id or "central"] = entry
end

-- Deterministic server-authored barriers and recovery floor are never omitted.
for _, collider in ipairs(plan.colliders) do
  local materialName = collider.kind == "mandatory_perimeter_barrier" and "Metal" or "Concrete"
  local tint = collider.kind == "mandatory_perimeter_barrier" and palette.barrier or palette.secondary
  add(root, collider.id, collider.position, collider.size, materialName, tint)
end

for _, element in ipairs(plan.elements or {}) do
  local regional = regionMaterials[element.region_id or "central"]
  local materialName = regional and regional.material or element.material or "Plastic"
  local tint = regional and regional.color or palette.secondary
  local parent = Instance.new("Model")
  parent.Name = tostring(element.id):sub(1, 80)
  parent.Parent = root
  local kind = string.lower(element.kind or "")
  local shape = (string.find(kind, "rock") or string.find(kind, "pedra")) and "sphere" or "block"
  if string.find(kind, "tree") or string.find(kind, "arvore") then
    local trunkHeight = math.max(2, element.size[2] * 0.55)
    add(parent, "Trunk", {element.position[1], element.position[2] - element.size[2]*0.2, element.position[3]},
      {math.max(2,element.size[1]*0.22),trunkHeight,math.max(2,element.size[3]*0.22)}, "Wood", {0.30,0.17,0.08}, "cylinder")
    add(parent, "Canopy", {element.position[1], element.position[2] + element.size[2]*0.18, element.position[3]},
      {element.size[1],element.size[2]*0.55,element.size[3]}, "Grass", tint, "sphere")
  else
    add(parent, element.kind, element.position, element.size, materialName, tint, shape)
  end
end

-- Models become native multi-part Roblox models with recognizable silhouettes.
for _, modelSpec in ipairs(plan.models or {}) do
  local model = Instance.new("Model")
  model.Name = tostring(modelSpec.id):sub(1, 80)
  model.Parent = root
  local p, s = modelSpec.position, modelSpec.size
  local kind = string.lower(modelSpec.kind or "")
  local baseColor = palette.primary
  if string.find(kind, "tower") or string.find(kind, "torre") then
    add(model, "Tower_Base", {p[1],p[2]-s[2]*0.25,p[3]}, {s[1],s[2]*0.5,s[3]}, "Concrete", baseColor)
    add(model, "Tower_Cap", {p[1],p[2]+s[2]*0.2,p[3]}, {s[1]*1.25,s[2]*0.12,s[3]*1.25}, "Slate", palette.accent)
  elseif string.find(kind, "bridge") or string.find(kind, "ponte") then
    add(model, "Bridge_Deck", p, {s[1],math.max(2,s[2]*0.12),s[3]}, "WoodPlanks", palette.secondary)
    for _, side in ipairs({-1,1}) do
      add(model, "Bridge_Support", {p[1],p[2]-s[2]*0.35,p[3]+side*s[3]*0.38},
        {math.max(2,s[1]*0.08),s[2]*0.7,math.max(2,s[3]*0.08)}, "Wood", baseColor)
    end
  elseif string.find(kind, "building") or string.find(kind, "predio") or string.find(kind, "house") then
    add(model, "Building_Body", {p[1],p[2]-s[2]*0.12,p[3]}, {s[1],s[2]*0.76,s[3]}, "Concrete", baseColor)
    add(model, "Building_Roof", {p[1],p[2]+s[2]*0.34,p[3]}, {s[1]*1.12,s[2]*0.12,s[3]*1.12}, "Slate", palette.accent)
  else
    add(model, modelSpec.kind or "Model", p, s, "Concrete", baseColor)
  end
end

for _, landmark in ipairs(plan.landmarks or {}) do
  add(root, landmark.kind or "Landmark", landmark.position, landmark.size, "Neon", palette.accent)
end

-- Spawn markers are visualized as small, non-blocking neon pads; gameplay spawns stay server-controlled.
for index, spawn in ipairs(plan.spawns or {}) do
  local pad = add(root, "Spawn_" .. index, {spawn[1],spawn[2]-2,spawn[3]}, {10,1,10}, "Neon", palette.accent)
  if pad then pad.Transparency = 0.25 end
end

root:SetAttribute("Forge3DMap", true)
root:SetAttribute("Theme", plan.theme or "Custom")
root:SetAttribute("Biome", plan.biome or "Custom")
root:SetAttribute("GeneratedParts", created)
print(string.format("[Forge3D] Map created: %d parts | %s | %s", created, plan.theme, plan.biome))
`;

  const recovery = `-- Forge3D Map Studio | Server-side out-of-bounds recovery
-- Place this Script in ServerScriptService. It is independent of client requests.
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local BOUNDS = { width = ${plan.bounds.width}, depth = ${plan.bounds.depth}, minY = ${plan.bounds.min_y} }
local SAFE_SPAWNS = ${luaLongString(JSON.stringify(plan.spawns))}
local HttpService = game:GetService("HttpService")
local spawnPoints = HttpService:JSONDecode(SAFE_SPAWNS)
local fallback = Vector3.new(0, BOUNDS.minY + 8, 0)
local function safeCFrame()
  local point = spawnPoints[1]
  if point then return CFrame.new(point[1], point[2] + 5, point[3]) end
  return CFrame.new(fallback)
end
local function recover(character)
  local root = character:WaitForChild("HumanoidRootPart", 10)
  if not root then return end
  local connection
  connection = RunService.Heartbeat:Connect(function()
    if not character.Parent or not root.Parent then
      if connection then connection:Disconnect() end
      return
    end
    local outside = math.abs(root.Position.X) > BOUNDS.width/2 + 12
      or math.abs(root.Position.Z) > BOUNDS.depth/2 + 12
      or root.Position.Y < BOUNDS.minY - 40
    if outside then
      character:PivotTo(safeCFrame())
      root.AssemblyLinearVelocity = Vector3.zero
      root.AssemblyAngularVelocity = Vector3.zero
    end
  end)
end
Players.PlayerAdded:Connect(function(player)
  player.CharacterAdded:Connect(recover)
  if player.Character then task.spawn(recover, player.Character) end
end)
for _, player in ipairs(Players:GetPlayers()) do
  if player.Character then task.spawn(recover, player.Character) end
  player.CharacterAdded:Connect(recover)
end
`;

  return {
    schema_version: "1.0",
    builder_luau: builder,
    recovery_luau: recovery,
    manifest: {
      files: ["Forge3D_MapBuilder.server.lua", "Forge3D_BoundaryRecovery.server.lua", "map-plan.json"],
      part_budget: maxParts,
      safety: ["4 perimeter barriers generated by server policy", "anchored/collidable recovery floor", "server-side character recovery outside map bounds"],
      install: ["Run Forge3D_MapBuilder.server.lua once in Roblox Studio Command Bar", "Create a Script named Forge3D_BoundaryRecovery in ServerScriptService and paste the recovery script", "Review generated geometry and test multiplayer before publishing"]
    }
  };
}

function validateForCompilation(plan: MapStudioPlan): string[] {
  const errors: string[] = [];
  const required = ["safety_wall_north", "safety_wall_south", "safety_wall_east", "safety_wall_west", "safety_recovery_floor"];
  for (const id of required) {
    const collider = plan.colliders.find(item => item.id === id && item.required);
    if (!collider || !collider.anchored || !collider.can_collide) errors.push(`Mandatory safety collider invalid: ${id}`);
  }
  if (plan.colliders.length > 400 || plan.elements.length > 200 || plan.models.length > 120) errors.push("Map exceeds generation limits.");
  if (plan.bounds.width < 128 || plan.bounds.depth < 128) errors.push("Map bounds are too small.");
  return errors;
}
