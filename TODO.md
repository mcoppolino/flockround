# Flockround Boids Project Plan (Rust WASM + Pixi WebGL)

Goal: a lightweight, high-resolution “murmuration” background with **real boids** (separation, alignment, cohesion), including a **full 3D sim path with optional z mode**, written for **performance + readability + maintainability**, with **modular helpers** (distance/neighbor calc tradeoffs) and a **shape influence system** that later supports morphing into icons/logos with fuzz.

---

## Task Status

- [x] Task 0 — Repo + Tooling Baseline
- [x] Task 1 — Data Model + Public API Contracts
- [x] Task 2 — Pixi WebGL Renderer Skeleton
- [x] Task 3 — Neighbor Search Module
- [x] Task 4 — Real Boids Forces
- [x] Task 4B — Full 3D Boids Core (Optional z Mode)
- [ ] Task 5 — Accuracy vs Compute Swappability
- [ ] Task 6 — JS/WASM Interop + Render Loop
- [ ] Task 7 — Shape Influence System
- [ ] Task 8 — Styling/Theming System
- [ ] Task 9 — Performance Tuning Pass
- [ ] Task 10 — Nice-to-Haves

---

## Task 0 — Repo + Tooling Baseline

### Reasoning Hint
- Recommended model level: **Low**.
- Switch to **Medium** when diagnosing cross-toolchain build/dev integration issues.

### Deliverables
- Monorepo with Rust WASM package + Vite TS app + Pixi renderer
- One command to run dev, one to build
- Pinned toolchain and package versions, documented in-repo
- Makefile targets for common workflows so the command surface stays stable

### Steps
1. Create repo structure:
   - `sim-wasm/` (Rust crate)
   - `web/` (Vite + TS + Pixi)
2. Add build tooling:
   - `wasm-pack` for Rust build
   - Vite config to import wasm pack output
3. Pin versions and document them:
   - Rust via `rust-toolchain.toml`
   - Node via `.nvmrc` (or `.node-version`) and `engines`
   - package manager via `packageManager` in root `package.json`
   - `wasm-pack` version requirement in README
4. Add scripts:
   - `dev`: build wasm in watch mode + run Vite
   - `build`: release wasm + Vite build
5. Add Makefile targets:
   - `install`, `dev`, `build`, `lint`, `format`, `check`, `test`
   - `wasm-dev`, `wasm-build` for direct Rust/WASM workflows
6. Add formatting/linting:
   - Rust: `rustfmt`, `clippy`
   - TS: eslint + prettier (minimal rules, consistent formatting)

---

## Task 1 — Data Model + Public API Contracts (Modularity First)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** only after ABI/contracts and invariants are locked, for mechanical plumbing.

### Deliverables
- A stable sim API you can keep as you optimize internals
- Typed-array backed particle state (no per-bird JS objects)
- Contract-first memory boundary: internal compute layout can evolve, external render ABI stays stable

### Steps
1. Lock the core particle state contract in Rust:
   - internal compute layout = **SoA** (`pos_x`, `pos_y`, `vel_x`, `vel_y`)
   - optional future Rust-only arrays are allowed (`seed/phase`, `depth_z`, `tmp_*` scratch)
   - external render layout = one preallocated interleaved `render_xy` buffer (`[x0, y0, x1, y1, ...]`)
   - JS gets a stable pointer/view to `render_xy` and reuses it every frame
   - JS must not read internal position/velocity arrays or multiple particle pointers
   - this boundary allows internal optimizations later without renderer/API refactors
2. Define `SimConfig` (Rust) with weights/radii/speeds:
   - `sep_weight`, `align_weight`, `coh_weight`
   - `neighbor_radius`, `separation_radius`
   - `speed_min`, `speed_max`, `max_force`
3. Define `SimInputs` (Rust) for each step:
   - `dt`, pointer position, pointer strength
   - active shape influence id + morph strength
   - bounds mode (wrap vs bounce)
4. Define WASM exports:
   - `new(count, seed, width, height)`
   - `set_config(...)` (or `set_config_json`)
   - `set_inputs(...)`
   - `step(dt)`
   - `set_bounds(width, height)`
   - `count()`
   - `render_xy_ptr()` (or semantic equivalent name)
   - optional: `render_xy_len()` returning `2 * count`
5. In TS, wrap exports in a clean class:
   - hides pointers, exposes `Float32Array` views
   - keep one cached `Float32Array` view for `render_xy`
   - if `wasm.memory.buffer` changes, recreate the view safely
6. Add invariants and checks early (debug/test builds):
   - no NaN/Inf in particle state after `step`
   - speed clamp is respected
   - positions remain valid for selected bounds mode (wrap/bounce)
7. Decide and document coordinate convention in API docs:
   - standardize on normalized coordinates (`x,y in [0,1]`) in sim + `render_xy`
   - renderer maps normalized values to screen space
8. Ensure `step()` refresh pattern is explicit and stable:
   - compute boids using SoA, integrate, then write `render_xy[2*i], render_xy[2*i+1]`
   - keep the copy path as default; optimize later only behind the same ABI

---

## Task 2 — Pixi WebGL Renderer Skeleton (Background-Ready)

### Reasoning Hint
- Recommended model level: **Medium**.
- Switch to **High** if batching approach or renderer architecture decisions become unclear.

### Deliverables
- Fullscreen canvas behind UI
- High-quality point rendering and an easy theming surface

### Steps
1. Create Pixi renderer module:
   - creates `Application`, attaches to a container element
   - handles resize, DPR cap, renderScale
2. Implement a basic draw path:
   - start with points/particles (fast)
   - ensure single-batch rendering (avoid thousands of DisplayObjects)
3. Implement “theme” config:
   - background color/alpha
   - particle color(s), opacity, blend mode
   - trail persistence (if you add trails later)
4. Add a clean API:
   - `renderer.setTheme(theme)`
   - `renderer.render(positions, velocities?, sizes?)`
5. Add a “Background Mode” preset:
   - conservative DPR cap
   - conservative particle opacity + blend for pleasant backdrop

---

## Task 3 — Neighbor Search Module (Grid / Spatial Hash)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** after the core algorithm is validated, for tests and integration wiring.

### Deliverables
- O(N)ish neighbor query baseline for real boids
- Internals designed so you can swap accuracy/perf tradeoffs

### Steps
1. Implement a uniform grid in Rust:
   - cell size ~ `neighbor_radius`
   - `head[cell]` + `next[i]` linked-list buckets (fast, no allocations)
2. Provide a `NeighborIndex` trait-like abstraction (Rust):
   - `build(positions)`
   - `for_each_neighbor(i, radius, callback)`
3. Add toggles:
   - fixed cell size vs derived from radius
   - optionally limit max neighbors visited per boid
4. Validate correctness with small N debug visualizations:
   - show neighbor counts distribution (optional debug build)

---

## Task 4 — Real Boids Forces (Separation, Alignment, Cohesion)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** once force equations are stable and invariants/tests pass.

### Deliverables
- Stable flocking “leave them alone” behavior across the screen

### Steps
1. Implement classic boids per boid `i`:
   - compute neighbor averages within `neighbor_radius`
   - compute separation within `separation_radius`
2. Use modular helper functions (see Task 5) for:
   - distance squared, normalization, clamp
3. Apply steering:
   - `accel = w_sep*sep + w_align*align + w_coh*coh`
   - clamp `accel` magnitude to `max_force`
4. Integrate:
   - `v += accel*dt`, clamp speed to `[min,max]`
   - `p += v*dt`
5. Bounds behavior:
   - start with wraparound (more “endless sky”)
   - keep bounce as optional mode for later comparison
6. Add mild global drift/noise (optional):
   - keeps motion from becoming too uniform

---

## Task 4B — Full 3D Boids Core (Optional z Mode)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** after API/buffer boundaries are locked and z behavior is stable, for plumbing + tests.

### Deliverables
- True 3D boids simulation path (`x,y,z` + `vx,vy,vz`) that remains optional at runtime
- Stable WASM boundary that keeps current XY render path working while exposing depth safely
- Renderer integration path that can consume z without forcing all themes/shapes to change at once

### Steps
1. Extend sim state to 3D SoA (Rust):
   - add `pos_z`, `vel_z`, `accel_z` buffers with zero per-step allocations
   - initialize z deterministically from seed in normalized range
2. Add z-mode config/input surface:
   - runtime toggle (`enable_z` or equivalent)
   - z behavior controls (`z_weight`, `z_min`, `z_max`, wrap/bounce choice)
3. Extend boids force evaluation to 3D:
   - neighbor broad phase can remain XY grid for now
   - narrow phase distance/steering uses full xyz deltas when z mode is enabled
   - if z mode is disabled, preserve existing 2D behavior
4. Integrate and clamp in 3D:
   - update `vz`, apply speed/max-force constraints coherently in 3D
   - document z bounds behavior (wrap or bounce) and keep it configurable
5. Preserve stable external data contract:
   - keep `render_xy_ptr()` path stable for compatibility
   - expose depth via an additive API (`render_z_ptr()`/`render_z_len()` or equivalent)
   - JS must still avoid direct reads of internal SoA buffers
6. Update TS wrapper + renderer contract:
   - optional z view creation and safe memory-buffer refresh handling
   - renderer can ignore z when disabled and consume it when enabled
7. Add invariants/tests:
   - no NaN/Inf in z state
   - z bounds invariants respected
   - 2D mode parity tests to prevent regressions

---

## Task 5 — Accuracy vs Compute Swappability (Distance + Math Helpers)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** for config plumbing, docs, and benchmark command wiring after math strategy design is set.

### Deliverables
- A clear place to trade precision for speed without rewriting boids logic

### Steps
1. Create a `math/` module in Rust with pluggable strategies:
   - `DistanceMetric` (squared Euclidean default)
   - `NormalizeStrategy` (exact vs approx)
   - `InvSqrtStrategy` (exact vs fast approx)
2. Provide at least 2 presets:
   - `Accurate`: normal `sqrt`, exact normalize
   - `Fast`: avoid sqrt when possible, approximate normalize (inv sqrt)
3. Wire these through boids force computation without clutter:
   - boids code calls a small set of helpers, not raw math everywhere
4. Add config flags:
   - `distance_mode = accurate|fast`
   - `limit_neighbors_k = 0|K`
5. Add microbench harness in Rust (feature-gated):
   - run `step` for N=5k/10k/20k and report timings

---

## Task 6 — JS/WASM Interop + Render Loop

### Reasoning Hint
- Recommended model level: **Medium**.
- Switch to **High** if memory view invalidation, dt stability, or GC churn issues appear.

### Deliverables
- Smooth animation loop with no per-frame allocations
- Easy integration into a portfolio page

### Steps
1. In TS, initialize:
   - load wasm, create sim, create renderer
2. Set up requestAnimationFrame loop:
   - compute `dt` (clamp to avoid huge steps on tab switching)
   - call `sim.step(dt)`
   - read `positions` typed array view
   - call `renderer.render(positions, velocities?)`
3. Zero-GC rule:
   - typed array views created once, reused
   - avoid creating new arrays/objects per frame
4. Add pause/resume:
   - pause when document hidden
   - optional: pause when element offscreen (IntersectionObserver)

---

## Task 7 — Shape Influence System (Schema + Fuzz)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** after interface/schema boundaries are frozen, for incremental backend implementation.

### Deliverables
- Birds “flock to” user-defined shapes with fuzzy organic behavior
- Shape schema easy to define (upload/draw simple shapes later)
- Incremental architecture that reaches morph targets without large refactors

### Steps
1. Define the stable architecture boundary first:
   - versioned TS/Rust `Shape` schema (`ShapeV1`)
   - `ShapeInfluence` interface in Rust (`force_at(position, boid_id) -> Vec2`)
   - JS/WASM API based on shape IDs + weights, not backend-specific internals
2. Implement v1 backend as sampled attractor points:
   - `Shape` with `type` and params
   - types: `circle`, `segment/polyline`, `polygon`, `text` (later), `svg-path` (later)
   - sampled from boundary and/or area for fuzzy flock targets
3. Define v2 migration path now (behind same interface):
   - reserve a second backend (SDF/field-based) with no public API changes
   - keep schema versioning and conversion rules documented
4. Implement `ShapeField` in Rust:
   - stores sampled points + a strength/falloff
   - exposes `force_at(position)` returning a steering vector
5. Add “fuzz”:
   - per-bird jitter seed influences sampling offset
   - noise in force direction magnitude for organic edges
6. Blend with boids:
   - total accel includes `shape_weight * shape_force`
   - with an ease parameter `morph_strength` (0..1)
7. Add shape switching hooks in TS:
   - `setActiveShape(id, strength)`

---

## Task 8 — Styling/Theming System (Colors, Opacity, Background Polish)

### Reasoning Hint
- Recommended model level: **Low → Medium**.
- Switch to **High** only if theme/render choices affect batching, memory churn, or simulation coupling.

### Deliverables
- One place to swap color schemes without touching sim
- Looks good as a background by default

### Steps
1. Define `Theme` in TS:
   - `bgColor`, `bgAlpha`
   - `particleColor`, `particleAlpha`
   - optional gradient palette / per-depth tint
   - blend mode selection
2. Add renderer support for:
   - different particle textures (soft dot vs sharper)
   - opacity curves based on speed or depth
3. Add a few curated themes:
   - “Night Sky”, “Soft Fog”, “High Contrast”
4. Add a simple theme switch function (no UI required):
   - can be triggered by site section/route

---

## Task 9 — Performance Tuning Pass (Ship-Ready)

### Reasoning Hint
- Recommended model level: **High**.
- Switch to **Medium** for routine baseline collection and reporting once tuning knobs are defined.

### Deliverables
- Stable FPS across a wide range of devices
- Clear, maintainable optimizations (no premature cleverness)
- Lightweight, repeatable benchmark tracking (not a deep perf study)

### Steps
1. Add an adaptive quality controller in TS:
   - cap DPR
   - adjust renderScale
   - adjust particle count (optional)
   - optionally run sim at 30Hz and render at 60Hz
2. Add sim-side perf knobs:
   - neighbor limit K
   - fast math preset
   - reduced neighbor radius on low tier
3. Validate no perf traps:
   - no per-frame allocations in TS
   - no Rust allocations per step (grid rebuild should reuse buffers)
4. Add debug overlay (dev only):
   - FPS, particle count, neighbors visited, tier
5. Add lightweight benchmark commands:
   - one Rust sim benchmark (`N`, `steps`, mode) with text/JSON output
   - one browser-side sampling script for frame-time percentile snapshots
6. Track trends, not absolute machine-specific FPS:
   - store baseline results in-repo
   - compare `% change` versus baseline across key configs (`5k`, `10k`, fast vs accurate)

---

## Task 10 — Nice-to-Haves (Pick Off Incrementally)

### Reasoning Hint
- Recommended model level: **Medium** overall.
- Switch per subtask: 10A **Low → Medium**, 10B **Medium**, 10C **High** (batched oriented rendering/LOD complexity).

### 10A — Parameterization (Optional)
Steps
1. Add a compile-time “background mode” preset (no UI)
2. Optionally add a hidden debug panel (dev-only) to tune weights/radii

### 10B — 3D Visual Polish (Recommended Nice-to-Have)
Steps
1. Refine existing z rendering curves (size/alpha/tint) for subtle depth
2. Add optional depth-aware effects:
   - far birds smaller/dimmer
   - near birds larger/brighter
3. Optionally add z-aware pointer parallax and fog falloff (theme-compatible)

### 10C — Bird Shapes (Chevrons / Triangles) Instead of Dots
Steps
1. Render oriented sprites/triangles using velocity direction
2. Keep batching (instanced geometry), avoid DisplayObject per bird
3. Add LOD:
   - far = dots
   - near = chevrons

---

## Acceptance Checklist

### Must-have requirements
- [ ] Real boids behavior (sep/align/cohere) with neighbor search (grid)
- [ ] Rust WASM sim + Pixi WebGL rendering
- [ ] Modular math helpers to trade accuracy vs compute
- [ ] Maintainable structure (clear modules, stable API)
- [ ] Full 3D boids path with optional z mode (without breaking 2D path)
- [ ] Shape influence system with simple schema + fuzzy morph
- [ ] Easy theming (colors/opacity/background polish)

### Nice-to-haves
- [ ] Optional parameterization (dev-only or preset-based)
- [ ] Depth illusion via size/alpha modulation
- [ ] Non-point bird shapes with LOD

---

## Execution Order (Sequential)
1. Task 0 — Repo + Tooling Baseline
2. Task 1 — Data Model + Public API Contracts
3. Task 2 — Pixi WebGL Renderer Skeleton
4. Task 3 — Neighbor Search Module
5. Task 4 — Real Boids Forces
6. Task 4B — Full 3D Boids Core (Optional z Mode)
7. Task 5 — Accuracy vs Compute Swappability
8. Task 6 — JS/WASM Interop + Render Loop
9. Task 7 — Shape Influence System
10. Task 8 — Styling/Theming System
11. Task 9 — Performance Tuning Pass
12. Task 10 — Nice-to-Haves
