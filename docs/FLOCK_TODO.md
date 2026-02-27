# Flock2 Integration Plan (Rust WASM + Existing Pixi Frontend)

Goal: implement a paper-aligned **Flock2 orientation-based model** alongside the existing sim while keeping the same frontend renderer and loop contract (`render_xy`, `render_z`, `step(dt)`).

---

## Implementation Stance

- Primary implementation should be in **Rust (`sim-wasm`)**, not TypeScript.
- TypeScript should remain orchestration/UI only (model selection, slider wiring, labels, presets).
- Reason: this work is per-boid, per-frame math and neighbor search; pushing it into Rust preserves performance, determinism, and the existing WASM boundary.

---

## Task Status

- [ ] Task 0 - Scope Lock + Naming
- [ ] Task 1 - Model Abstraction in Web Layer
- [ ] Task 2 - Sim Module Dropdown + Control Routing
- [ ] Task 3 - Rust API Extension for Multi-Model Support
- [ ] Task 4 - Flock2 Social Orientation Controller
- [ ] Task 5 - Flock2 Flight/Aerodynamic Integrator
- [ ] Task 6 - Hyperparameter Sliders + Presets
- [ ] Task 7 - Validation + Performance Gates
- [ ] Task 8 - Docs + Operational Notes

---

## Task 0 - Scope Lock + Naming

### Reasoning Hint
- Recommended model level: **Low**.

### Instructions
1. Keep current model as `Flockround Classic`.
2. Add paper model as `Flock2 Orientation`.
3. Keep renderer unchanged (`web/src/render.ts` only consumes position/depth arrays).
4. Keep both models under one `Sim` instance API from JS perspective.

### Success Criteria
- Model names are finalized and used consistently in code/UI/docs.
- No renderer API changes required to switch models.

---

## Task 1 - Model Abstraction in Web Layer

### Reasoning Hint
- Recommended model level: **Medium**.

### Instructions
1. Add a model enum/type in `web/src/main.ts`.
2. Separate UI state into:
   - shared settings (boid count, render stride, profiling, bounds toggles where applicable)
   - model-specific settings (`classic`, `flock2`)
3. Add a single `applyModelSettings()` path to avoid duplicate event logic.

### Success Criteria
- Switching models does not break simulation loop.
- Model-specific values persist when toggling between models.

---

## Task 2 - Sim Module Dropdown + Control Routing

### Reasoning Hint
- Recommended model level: **Medium**.

### Instructions
1. Add a dropdown/select in the existing debug control panel.
2. Route slider visibility and labels based on selected model.
3. Keep controls compact; avoid rendering irrelevant sliders for current model.

### Success Criteria
- UI can switch between `Flockround Classic` and `Flock2 Orientation` at runtime.
- Only applicable sliders are shown for active model.

---

## Task 3 - Rust API Extension for Multi-Model Support

### Reasoning Hint
- Recommended model level: **High**.

### Instructions
1. Add `model_kind` in Rust sim config/state.
2. Add Flock2-specific config struct and sanitized setters.
3. Extend `web/src/wasm.ts` with explicit Flock2 setters (or grouped set-config call).
4. Maintain existing output pointers/lengths:
   - `render_xy_ptr`, `render_xy_len`
   - `render_z_ptr`, `render_z_len`

### Success Criteria
- JS can set model kind and parameters without changing render contract.
- Existing classic model behavior remains available and unchanged when selected.

---

## Task 4 - Flock2 Social Orientation Controller

### Reasoning Hint
- Recommended model level: **High**.

### Instructions
1. Implement topological neighbor sampling (target `k=7` default).
2. Apply forward field-of-view filtering (`fov` parameter).
3. Compute orientation target terms:
   - avoidance (nearest neighbor, angular target)
   - alignment (avg neighbor velocity target)
   - cohesion (avg neighbor centroid target)
   - peripheral boundary term (based on neighbor density/count)
4. Sum terms into yaw/pitch orientation targets with wrapping-safe math.

### Success Criteria
- Orientation-target outputs are finite and stable for large bird counts.
- Peripheral boundary term produces bounded/ovoidal flock behavior instead of long snake formations.

---

## Task 5 - Flock2 Flight/Aerodynamic Integrator

### Reasoning Hint
- Recommended model level: **High**.

### Instructions
1. Add reaction-speed-based turn response toward target orientation.
2. Add force components:
   - lift
   - drag
   - thrust
   - gravity
3. Add dynamic stability reorientation toward velocity vector.
4. Integrate velocity/position with existing fixed step.
5. Preserve bounds semantics and z-depth sync.

### Success Criteria
- Simulation remains numerically stable under default parameters.
- Birds exhibit realistic turn behavior without direct social-force acceleration vectors.

---

## Task 6 - Hyperparameter Sliders + Presets

### Reasoning Hint
- Recommended model level: **Medium**.

### Instructions
1. Add model-specific sliders for Flock2 at minimum:
   - neighbors
   - FOV
   - avoid/alignment/cohesion strengths
   - boundary amount + boundary count
   - reaction speed
   - dynamic stability
2. Add advanced sliders (optional panel):
   - mass, wing area, lift factor, drag factor, thrust/power
   - min/max speed, air density, gravity
3. Seed defaults from paper appendix, with clamped safe ranges.

### Success Criteria
- All Flock2 hyperparameters are runtime-adjustable via UI.
- Reset/preset action restores known-good default set.

---

## Task 7 - Validation + Performance Gates

### Reasoning Hint
- Recommended model level: **High**.

### Instructions
1. Add regression checks:
   - classic model parity (sanity snapshots)
   - no NaN/Inf in positions/velocities/orientation state
2. Profile step time with representative counts (e.g. 2k/5k/10k).
3. Verify runtime switching does not leak memory or stall frame loop.
4. Validate behavior quality:
   - cohesive bounded flock
   - visible wave-like turn propagation events

### Success Criteria
- Stable frame loop and acceptable step time at target boid count.
- Both models run correctly and can be switched live.

---

## Task 8 - Docs + Operational Notes

### Reasoning Hint
- Recommended model level: **Low**.

### Instructions
1. Document model differences in README.
2. Document each Flock2 slider meaning and units/ranges.
3. Record known limitations (simplified aero assumptions, no predator term initially).

### Success Criteria
- New contributor can run, switch models, and tune Flock2 without reading paper/code first.

---

## Initial Flock2 Defaults (Paper-Aligned Starting Point)

- neighbors: `7`
- fov: `290 deg` (start near starling-like value)
- avoid strength: `0.02`
- alignment strength: `0.60`
- cohesion strength: `0.004`
- boundary strength: `0.10`
- boundary count/size: `20`
- mass: `0.08`
- wing area: `0.0224`
- lift factor: `0.5714`
- drag factor: `0.1731`
- reaction speed: `250 ms`
- dynamic stability: `0.70`
- min speed: `5`
- max speed: `18`
- thrust/power scalar: `0.2373`
- air density: `1.225`
- gravity: `9.8`

