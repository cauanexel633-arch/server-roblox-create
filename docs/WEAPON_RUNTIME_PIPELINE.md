# Forge3D weapon runtime pipeline

## Specialist agents

Five specialist agents run concurrently for each weapon:
- **WeaponDesignDirector**: weapon-specific visual behavior and VFX.
- **WeaponLayoutDesigner**: category HUD and allowed controls.
- **WeaponAnimationDirector**: deterministic action clips and optional random idle/inspect/equip variants.
- **WeaponScripter**: proposes combat configuration against the fixed RemoteEvent contract; it cannot invent remotes or grant client authority.
- **WeaponSecurityAuditor**: reports suspicious or unsafe plan choices.

Model output is untrusted. The API parses JSON, clamps numeric values, filters actions and controls through allowlists, infers combat class from the player description, and overwrites security-critical values with server policy. The model cannot choose damage, claim a hit, set authoritative ammo, or disable server raycast validation.

## Runtime classes and HUD

| Class | HUD | Controls | Visual feedback |
|---|---|---|---|
| Melee | melee_compact | melee, block, parry, inspect | swing trail, impact burst, hit spark |
| Firearm | firearm_hud | fire, aim, reload, inspect | moving tracer, muzzle flash, shell ejection, recoil |
| Projectile | projectile_hud | fire, aim, reload, charge, inspect | moving projectile/tracer, impact burst |

The layouts are data-driven. The selected controls are filtered by the API and can be styled per weapon family.

## LocalScript / RemoteEvent contract

A generated client package uses only:
- `ForgeWeaponAction`: client -> server action request.
- `ForgeWeaponFeedback`: server -> client confirmed state and visual cues.

The client may send `weapon_id`, an allowlisted `action`, aim origin/direction, and a timestamp for diagnostics. The server derives Player from `OnServerEvent`, validates Tool ownership/equipped state, action allowlists, distance, vector magnitude, cadence, magazine and reload state, then performs its own raycast/projectile simulation.

Never trust client-supplied damage, target, hit position, ammo count, weapon owner, fire rate, or reload completion. Never expose Forge3D API secrets or OpenRouter keys to a LocalScript.

## Animation policy

Important actions (fire, reload, aim, swing, block, parry, equip, holster) are deterministic and should map to authored Animation assets. Random variants are cosmetic only (idle, inspect, equip flourish) and should use a per-equip seed so all clients see consistent state when replicated. Randomness must never alter damage, hitboxes, timing, cooldowns, or reload outcomes.

This stage creates an animation plan, not uploaded AnimationIds or rigged keyframes. A later rigging/animation asset stage must author and publish those assets.

## Projectile and melee VFX

Firearm tracers are visual-only and follow the server-confirmed shot direction. The server raycast/projectile result determines impacts. Melee uses trails/arc particles attached to weapon attachments and server-confirmed hit windows. Cosmetic prediction may start immediately, but must be corrected or cancelled by server feedback.

## Delivery status

This planner and contract do not install scripts into a live Roblox experience. Before production activation, runtime scripts must be included in the package manifest, imported into Studio, and tested in a multiplayer server with malformed remote payloads.
