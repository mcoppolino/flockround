# Flockround Boids Project Plan (Rust WASM + Pixi WebGL)

Goal: a lightweight, high-resolution “murmuration” background with **real boids** (separation, alignment, cohesion), written for **performance + readability + maintainability**, with **modular helpers** (distance/neighbor calc tradeoffs) and a **shape influence system** that later supports morphing into icons/logos with fuzz.

---

## Task 0 — Repo + Tooling Baseline

### Deliverables
- Monorepo with Rust WASM package + Vite TS app + Pixi renderer
- One command to run dev, one to build

### Steps
1. Create repo structure:
   - `sim-wasm/` (Rust crate)
   - `web/` (Vite + TS + Pixi)
2. Add build tooling:
   - `wasm-pack` for Rust build
   - Vite config to import wasm pack output
3. Add scripts:
   - `dev`: build wasm in watch mode + run Vite
   - `build`: release wasm + Vite build
4. Add formatting/linting:
   - Rust: `rustfmt`, `clippy`
   - TS: eslint + prettier (minimal rules, consistent formatting)

---

## Task 1 — Data Model + Public API Contracts (Modularity First)

### Deliverables
- A stable sim API you can keep as you optimize internals
- Typed-array backed particle state (no per-bird JS objects)

### Steps
1. Define core particle state layout in Rust:
   - positions, velocities, optional depth/size scalar
   - choose **SoA** (separate arrays) for compute or **AoS** (interleaved) for upload
   - recommended: SoA for sim, plus an interleaved export buffer for renderer
2. Define `SimConfig` (Rust) with weights/radii/speeds:
   - `sep_weight`, `align_weight`, `coh_weight`
   - `neighbor_radius`, `separation_radius`
   - `speed_min`, `speed_max`, `max_force`
3. Define `SimInputs` (Rust) for each step:
   - `dt`, pointer position, pointer strength
   - active shape influence id + morph strength
   - bounds mode (wrap vs bounce)
4. Define WASM exports:
   - `new(count, seed, config_json?)`
   - `set_config(...)` (or `set_config_json`)
   - `set_inputs(...)`
   - `step(dt)`
   - `positions_ptr()`, `velocities_ptr()` (optional), `count()`
5. In TS, wrap exports in a clean class:
   - hides pointers, exposes `Float32Array` views

---

## Task 2 — Pixi WebGL Renderer Skeleton (Background-Ready)

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

## Task 5 — Accuracy vs Compute Swappability (Distance + Math Helpers)

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

### Deliverables
- Birds “flock to” user-defined shapes with fuzzy organic behavior
- Shape schema easy to define (upload/draw simple shapes later)

### Steps
1. Define a shape schema (versioned) in TS + Rust:
   - `Shape` with `type` and params
   - types: `circle`, `segment/polyline`, `polygon`, `text` (later), `svg-path` (later)
2. Decide shape influence representation:
   - **v1 (simple): attractor points** sampled from shape boundary/area
   - later: SDF texture/field for higher quality
3. Implement `ShapeField` in Rust:
   - stores sampled points + a strength/falloff
   - exposes `force_at(position)` returning a steering vector
4. Add “fuzz”:
   - per-bird jitter seed influences sampling offset
   - noise in force direction magnitude for organic edges
5. Blend with boids:
   - total accel includes `shape_weight * shape_force`
   - with an ease parameter `morph_strength` (0..1)
6. Add shape switching hooks in TS:
   - `setActiveShape(id, strength)`

---

## Task 8 — Styling/Theming System (Colors, Opacity, Background Polish)

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

### Deliverables
- Stable FPS across a wide range of devices
- Clear, maintainable optimizations (no premature cleverness)

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

---

## Task 10 — Nice-to-Haves (Pick Off Incrementally)

### 10A — Parameterization (Optional)
Steps
1. Add a compile-time “background mode” preset (no UI)
2. Optionally add a hidden debug panel (dev-only) to tune weights/radii

### 10B — “3D” Depth Illusion (Recommended Nice-to-Have)
Steps
1. Add per-bird `z` scalar (0..1) updated slowly (noise or orbit)
2. Render size and alpha based on z:
   - far birds smaller/dimmer
   - near birds larger/brighter
3. Optionally parallax pointer influence by depth

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
- [ ] Shape influence system with simple schema + fuzzy morph
- [ ] Easy theming (colors/opacity/background polish)

### Nice-to-haves
- [ ] Optional parameterization (dev-only or preset-based)
- [ ] Depth illusion via size/alpha modulation
- [ ] Non-point bird shapes with LOD

---

## Suggested Build Order (Fastest Path to “Looks Good”)
1. Task 0 → 2 → 6 (get something on screen)
2. Task 1 → 3 → 4 (real boids working)
3. Task 5 (modularity + perf presets)
4. Task 7 (shapes + fuzz)
5. Task 8 → 9 (background polish + ship)
6. Task 10 (extras)
