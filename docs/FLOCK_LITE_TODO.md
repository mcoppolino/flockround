# Flock2-Lite CPU Plan

Goal: provide a simplified flock model that is practical on CPU while keeping the same renderer/WASM boundary and model dropdown workflow.

---

## Performance Targets

- 2,000 boids at ~60 FPS on laptop CPU
- 5,000 boids at ~30 FPS fallback mode
- No frame hitching during model switches

---

## Model Variants

1. `Flockround Classic` (existing baseline)
2. `F2 Lite Social` (orientation-only social steering)
3. `F2 Lite Social+Flight` (social steering + cheap scalar flight proxy)

---

## Task Status

- [ ] Task 0 - Scope + Budget Guardrails
- [ ] Task 1 - Add Lite Model Kinds (UI + WASM + Rust routing)
- [ ] Task 2 - Implement Lite Social Step
- [ ] Task 3 - Implement Lite Social+Flight Step
- [ ] Task 4 - Slider Surface + Presets
- [ ] Task 5 - CPU Profiling + Caps
- [ ] Task 6 - Docs + Migration Notes

---

## Task 0 - Scope + Budget Guardrails

### Instructions
1. Keep same render contract (`render_xy`, `render_z`) and animation loop.
2. Keep all heavy logic in Rust, TS only for controls/wiring.
3. Set hard defaults for lite mode:
   - `k <= 12`
   - bounded neighbor radius
   - optional half-rate social update switch.

### Success Criteria
- Lite modes can be enabled without API/renderer refactor.
- Parameter caps are enforced in Rust sanitization.

---

## Task 1 - Add Lite Model Kinds

### Instructions
1. Add model kinds:
   - `f2-lite-social`
   - `f2-lite-social-flight`
2. Expose through:
   - Rust enum + wasm exports
   - TS wasm client type mapping
   - UI dropdown labels.

### Success Criteria
- User can select both lite modes in UI.
- Routing reaches dedicated lite simulation path in Rust.

---

## Task 2 - Implement Lite Social Step

### Instructions
1. Use grid + metric neighbors with max cap `k`.
2. Skip topological insertion sort.
3. Use simple vector blending in world space:
   - separation
   - alignment
   - cohesion
   - boundary pull if sparse neighborhood.
4. Heading update:
   - `heading = normalize(lerp(heading, target, reaction_gain))`.
5. Keep constant/clamped speed and normal bounds integration.

### Success Criteria
- Stable flocking, no NaN/Inf, visibly coherent grouping.
- Faster than full Flock2 path at same boid count.

---

## Task 3 - Implement Lite Social+Flight Step

### Instructions
1. Reuse lite social heading target.
2. Replace full aerodynamic vectors with scalar speed proxy:
   - `speed += thrust*dt - drag*speed^2*dt - climb_penalty`
   - clamp to `[min_speed, max_speed]`.
3. Velocity follows heading with scalar speed.

### Success Criteria
- Motion differs from social-only mode (more speed dynamics).
- Still remains CPU-friendly and stable.

---

## Task 4 - Slider Surface + Presets

### Instructions
1. Keep a reduced slider set visible for lite modes:
   - social: `avoid, align, cohesion, boundary, radius, k, fov, reaction`
   - flight add-ons: `thrust, drag, minSpeed, maxSpeed`
2. Provide reset/preset buttons:
   - `Lite Balanced`
   - `Lite Dense`
   - `Lite Fast`.

### Success Criteria
- Controls are concise and understandable.
- Presets instantly produce stable flock behavior.

---

## Task 5 - CPU Profiling + Caps

### Instructions
1. Record sim ms/frame by model and boid count.
2. Add recommended boid caps per model in UI help text.
3. Optional adaptive downshift:
   - reduce `k`
   - reduce active boids
   - increase render stride.

### Success Criteria
- Measured profile table for 2k/5k/10k boids.
- Lite modes meet stated target FPS envelopes.

---

## Task 6 - Docs + Migration Notes

### Instructions
1. Document difference between full and lite models.
2. Document known approximations in lite flight mode.
3. Document when to choose each model.

### Success Criteria
- Contributor can choose and tune model without code dive.

