# Forge3D Map Studio

Map Studio is an independent pipeline, separate from weapon generation. It shares the agent runtime and infrastructure but owns its own schema, validation, planning stages, artifacts and eventual publishing adapter.

## Specialist agents and tools

1. MapInterpreter — turns the player prompt into a constrained map brief.
2. MapReferenceScout — proposes online search queries and HTTPS reference candidates. Candidates remain unverified until a real search/fetch provider confirms them.
3. MapArchitect — lays out regions, routes, spawn points and landmarks.
4. MapElementPlanner — plans reusable 3D props and environmental elements.
5. MapModeler3D — plans model groups, dimensions and complexity.
6. MapTexturizer — assigns materials, roughness, metalness and regional surface styles.
7. MapPaletteDirector — produces a coherent RGB palette with path/obstacle contrast.
8. MapCollider3D — proposes collision volumes; it cannot remove mandatory safety geometry.
9. MapReviewer — checks playability, performance and safety findings.

All agent output is untrusted JSON. Coordinates, sizes, IDs, RGB values and lists are normalized and clamped before use.

## Mandatory anti-fall perimeter

The server deterministically inserts four full-length boundary walls (north, south, east, west) regardless of what the agents return or what the player asks for:
- Height: 32 studs (minimum policy: 24).
- Thickness: 4 studs.
- Anchored: true.
- CanCollide: true.
- The walls cover all four sides of the playable bounds and overlap at corners.\n- A mandatory anchored, collidable recovery floor sits below the map bounds as a secondary catch surface.
- Agent-proposed perimeter colliders are discarded so they cannot weaken or replace the mandatory barriers.
- The validator rejects a plan if any required wall is missing, non-collidable, unanchored or too short.
- Spawn points and generated elements are kept inside the playable bounds.

A later runtime stage should also add an out-of-bounds recovery volume/teleport as defense in depth. Perimeter barriers are the primary physical containment, not a substitute for server-side character recovery.

## Output and native Roblox compilation

The pipeline now compiles the validated plan into a downloadable package through the authenticated `POST /v1/maps/compile` endpoint:
- `map-plan.json`: validated structured plan.
- `Forge3D_MapBuilder.server.lua`: native Roblox Parts/Models plus Terrain substrate, regional materials, RGB palette, landmark/spawn visuals, and all mandatory safety colliders.
- `Forge3D_BoundaryRecovery.server.lua`: server-side Heartbeat guard that returns characters beyond map bounds or below the recovery threshold to a safe spawn.
- `manifest.json`: package files, safety guarantees, part budget and installation steps.

The API stores each file in the private `packages` bucket and returns signed download URLs that expire after one hour. The builder uses native Roblox geometry and does not require EditableMesh permissions. It creates deterministic primitive assemblies for models (for example towers, bridges, buildings, trees and rocks); arbitrary high-detail meshes, UV texture maps and rasterized PBR textures are not yet generated.

Installation requires running the builder once in Roblox Studio Command Bar, then placing the recovery script in ServerScriptService. The generated map is not automatically inserted into a live experience or published by the cloud service. Review the geometry and run a multiplayer Studio test before publishing.

## Online reference safety

Reference candidates are HTTPS-only and reject local/private network hosts. When `TAVILY_API_KEY` is configured, Map Studio performs live web searches (up to three focused queries, basic depth, up to five results each). Without that key, only unverified agent candidates are returned. Never let arbitrary player URLs trigger server-side fetches.
