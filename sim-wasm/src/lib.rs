mod neighbor_grid;

use neighbor_grid::NeighborGrid;
use std::f32::consts::TAU;
use wasm_bindgen::prelude::*;

const MIN_BOUND: f32 = 1.0e-6;
const EPSILON: f32 = 1.0e-6;
const DT_MIN: f32 = 0.0;
const DT_MAX: f32 = 0.1;
const WORLD_SIZE: f32 = 1.0;
const DEFAULT_Z_LAYER: f32 = 0.5;

const MIN_NEIGHBOR_RADIUS: f32 = 0.001;
const MAX_NEIGHBOR_RADIUS: f32 = 0.5;
const MIN_SEPARATION_RADIUS: f32 = 0.0005;
const MIN_SPEED: f32 = 0.0;
const MAX_SPEED: f32 = 3.0;
const MIN_MAX_FORCE: f32 = 0.0;
const MAX_MAX_FORCE: f32 = 5.0;
const MIN_Z_FORCE_SCALE: f32 = 0.0;
const MAX_Z_FORCE_SCALE: f32 = 2.0;
const DEFAULT_Z_FORCE_SCALE: f32 = 0.75;

#[derive(Clone, Copy)]
struct Lcg32 {
    state: u32,
}

impl Lcg32 {
    fn new(seed: u32) -> Self {
        let state = if seed == 0 { 0xA341_316C } else { seed };
        Self { state }
    }

    fn next_u32(&mut self) -> u32 {
        self.state = self
            .state
            .wrapping_mul(1_664_525)
            .wrapping_add(1_013_904_223);
        self.state
    }

    fn next_f32(&mut self) -> f32 {
        (self.next_u32() >> 8) as f32 / ((1_u32 << 24) as f32)
    }
}

#[derive(Clone, Copy)]
struct SimConfig {
    sep_weight: f32,
    align_weight: f32,
    coh_weight: f32,
    neighbor_radius: f32,
    separation_radius: f32,
    min_speed: f32,
    max_speed: f32,
    max_force: f32,
}

impl Default for SimConfig {
    fn default() -> Self {
        Self {
            sep_weight: 1.45,
            align_weight: 1.0,
            coh_weight: 0.85,
            neighbor_radius: 0.08,
            separation_radius: 0.035,
            min_speed: 0.045,
            max_speed: 0.19,
            max_force: 0.42,
        }
    }
}

impl SimConfig {
    fn sanitize(&mut self) {
        self.sep_weight = clamp_finite(self.sep_weight, 0.0, 10.0, 1.45);
        self.align_weight = clamp_finite(self.align_weight, 0.0, 10.0, 1.0);
        self.coh_weight = clamp_finite(self.coh_weight, 0.0, 10.0, 0.85);

        self.neighbor_radius = clamp_finite(
            self.neighbor_radius,
            MIN_NEIGHBOR_RADIUS,
            MAX_NEIGHBOR_RADIUS,
            0.08,
        );

        self.separation_radius = clamp_finite(
            self.separation_radius,
            MIN_SEPARATION_RADIUS,
            self.neighbor_radius,
            0.035,
        );

        self.min_speed = clamp_finite(self.min_speed, MIN_SPEED, MAX_SPEED, 0.045);
        self.max_speed = clamp_finite(
            self.max_speed,
            self.min_speed.max(MIN_NEIGHBOR_RADIUS),
            MAX_SPEED,
            0.19,
        );

        self.max_force = clamp_finite(self.max_force, MIN_MAX_FORCE, MAX_MAX_FORCE, 0.42);
    }
}

#[wasm_bindgen]
pub struct Sim {
    count: usize,
    width: f32,
    height: f32,
    config: SimConfig,
    bounce_x: bool,
    bounce_y: bool,
    bounce_z: bool,
    z_mode_enabled: bool,
    z_force_scale: f32,
    pos_x: Vec<f32>,
    pos_y: Vec<f32>,
    pos_z: Vec<f32>,
    vel_x: Vec<f32>,
    vel_y: Vec<f32>,
    vel_z: Vec<f32>,
    accel_x: Vec<f32>,
    accel_y: Vec<f32>,
    accel_z: Vec<f32>,
    render_xy: Vec<f32>,
    render_z: Vec<f32>,
    neighbor_grid: NeighborGrid,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(count: usize, seed: u32, width: f32, height: f32) -> Sim {
        let width = width.max(MIN_BOUND);
        let height = height.max(MIN_BOUND);
        let config = SimConfig::default();
        let mut rng = Lcg32::new(seed);

        let mut pos_x = vec![0.0; count];
        let mut pos_y = vec![0.0; count];
        let mut pos_z = vec![0.0; count];
        let mut vel_x = vec![0.0; count];
        let mut vel_y = vec![0.0; count];
        let mut vel_z = vec![0.0; count];
        let mut render_xy = vec![0.0; count * 2];
        let mut render_z = vec![DEFAULT_Z_LAYER; count];

        for i in 0..count {
            pos_x[i] = rng.next_f32();
            pos_y[i] = rng.next_f32();
            pos_z[i] = rng.next_f32();

            let angle = rng.next_f32() * TAU;
            let speed = config.min_speed + (config.max_speed - config.min_speed) * rng.next_f32();
            vel_x[i] = angle.cos() * speed;
            vel_y[i] = angle.sin() * speed;
            vel_z[i] = (rng.next_f32() * 2.0 - 1.0) * speed * 0.35;

            let base = 2 * i;
            render_xy[base] = pos_x[i];
            render_xy[base + 1] = pos_y[i];
            render_z[i] = DEFAULT_Z_LAYER;
        }

        Sim {
            count,
            width,
            height,
            config,
            bounce_x: false,
            bounce_y: false,
            bounce_z: false,
            z_mode_enabled: false,
            z_force_scale: DEFAULT_Z_FORCE_SCALE,
            pos_x,
            pos_y,
            pos_z,
            vel_x,
            vel_y,
            vel_z,
            accel_x: vec![0.0; count],
            accel_y: vec![0.0; count],
            accel_z: vec![0.0; count],
            render_xy,
            render_z,
            neighbor_grid: NeighborGrid::new(count, WORLD_SIZE, WORLD_SIZE, config.neighbor_radius),
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn set_config(
        &mut self,
        sep_weight: f32,
        align_weight: f32,
        coh_weight: f32,
        neighbor_radius: f32,
        separation_radius: f32,
        min_speed: f32,
        max_speed: f32,
        max_force: f32,
    ) {
        self.config = SimConfig {
            sep_weight,
            align_weight,
            coh_weight,
            neighbor_radius,
            separation_radius,
            min_speed,
            max_speed,
            max_force,
        };
        self.config.sanitize();

        self.neighbor_grid
            .set_cell_size(self.config.neighbor_radius);
    }

    pub fn set_z_mode(&mut self, enabled: bool) {
        self.z_mode_enabled = enabled;

        if !enabled {
            for i in 0..self.count {
                self.pos_z[i] = DEFAULT_Z_LAYER;
                self.vel_z[i] = 0.0;
                self.accel_z[i] = 0.0;
                self.render_z[i] = DEFAULT_Z_LAYER;
            }
            return;
        }

        for i in 0..self.count {
            self.render_z[i] = self.pos_z[i];
        }
    }

    pub fn z_mode_enabled(&self) -> bool {
        self.z_mode_enabled
    }

    pub fn set_z_force_scale(&mut self, scale: f32) {
        self.z_force_scale = clamp_finite(
            scale,
            MIN_Z_FORCE_SCALE,
            MAX_Z_FORCE_SCALE,
            DEFAULT_Z_FORCE_SCALE,
        );
    }

    pub fn set_bounce_bounds(&mut self, enabled: bool) {
        self.bounce_x = enabled;
        self.bounce_y = enabled;
        self.bounce_z = enabled;
    }

    pub fn bounce_bounds(&self) -> bool {
        self.bounce_x && self.bounce_y && self.bounce_z
    }

    pub fn set_axis_bounce(&mut self, bounce_x: bool, bounce_y: bool, bounce_z: bool) {
        self.bounce_x = bounce_x;
        self.bounce_y = bounce_y;
        self.bounce_z = bounce_z;
    }

    pub fn bounce_x(&self) -> bool {
        self.bounce_x
    }

    pub fn bounce_y(&self) -> bool {
        self.bounce_y
    }

    pub fn bounce_z(&self) -> bool {
        self.bounce_z
    }

    pub fn step(&mut self, dt: f32) {
        let dt = dt.clamp(DT_MIN, DT_MAX);
        if dt <= 0.0 || self.count == 0 {
            return;
        }

        self.neighbor_grid
            .set_cell_size(self.config.neighbor_radius);
        self.neighbor_grid
            .rebuild(&self.pos_x, &self.pos_y, WORLD_SIZE, WORLD_SIZE);

        for i in 0..self.count {
            let (ax, ay, az) = self.compute_boids_acceleration(i);
            self.accel_x[i] = ax;
            self.accel_y[i] = ay;
            self.accel_z[i] = az;
        }

        for i in 0..self.count {
            let mut vx = self.vel_x[i] + self.accel_x[i] * dt;
            let mut vy = self.vel_y[i] + self.accel_y[i] * dt;
            let mut vz = if self.z_mode_enabled {
                self.vel_z[i] + self.accel_z[i] * dt
            } else {
                0.0
            };

            let speed_sq = if self.z_mode_enabled {
                vx * vx + vy * vy + vz * vz
            } else {
                vx * vx + vy * vy
            };

            if speed_sq <= EPSILON {
                if self.config.min_speed > 0.0 {
                    vx = self.config.min_speed;
                    vy = 0.0;
                    vz = 0.0;
                }
            } else {
                let speed = speed_sq.sqrt();
                if speed < self.config.min_speed {
                    let scale = self.config.min_speed / speed;
                    vx *= scale;
                    vy *= scale;
                    if self.z_mode_enabled {
                        vz *= scale;
                    }
                } else if speed > self.config.max_speed {
                    let scale = self.config.max_speed / speed;
                    vx *= scale;
                    vy *= scale;
                    if self.z_mode_enabled {
                        vz *= scale;
                    }
                }
            }

            let (x, vx) = integrate_axis(self.pos_x[i], vx, dt, self.bounce_x);
            let (y, vy) = integrate_axis(self.pos_y[i], vy, dt, self.bounce_y);
            let (z, vz) = if self.z_mode_enabled {
                integrate_axis(self.pos_z[i], vz, dt, self.bounce_z)
            } else {
                (DEFAULT_Z_LAYER, 0.0)
            };

            self.vel_x[i] = vx;
            self.vel_y[i] = vy;
            self.vel_z[i] = if self.z_mode_enabled { vz } else { 0.0 };
            self.pos_x[i] = x;
            self.pos_y[i] = y;
            self.pos_z[i] = z;

            let base = 2 * i;
            self.render_xy[base] = x;
            self.render_xy[base + 1] = y;
            self.render_z[i] = z;
        }

        self.debug_validate_state();
    }

    pub fn set_bounds(&mut self, width: f32, height: f32) {
        self.width = width.max(MIN_BOUND);
        self.height = height.max(MIN_BOUND);
    }

    pub fn count(&self) -> usize {
        self.count
    }

    pub fn render_xy_ptr(&self) -> *const f32 {
        self.render_xy.as_ptr()
    }

    pub fn render_xy_len(&self) -> usize {
        self.render_xy.len()
    }

    pub fn render_z_ptr(&self) -> *const f32 {
        self.render_z.as_ptr()
    }

    pub fn render_z_len(&self) -> usize {
        self.render_z.len()
    }
}

impl Sim {
    fn compute_boids_acceleration(&self, i: usize) -> (f32, f32, f32) {
        let wrap_x = !self.bounce_x;
        let wrap_y = !self.bounce_y;
        let wrap_z = !self.bounce_z;
        let px = self.pos_x[i];
        let py = self.pos_y[i];
        let pz = self.pos_z[i];
        let vx = self.vel_x[i];
        let vy = self.vel_y[i];
        let vz = self.vel_z[i];

        let neighbor_radius_sq = self.config.neighbor_radius * self.config.neighbor_radius;
        let separation_radius_sq = self.config.separation_radius * self.config.separation_radius;

        let mut sep_x = 0.0;
        let mut sep_y = 0.0;
        let mut sep_z = 0.0;
        let mut sep_count = 0usize;

        let mut align_x = 0.0;
        let mut align_y = 0.0;
        let mut align_z = 0.0;

        let mut coh_x = 0.0;
        let mut coh_y = 0.0;
        let mut coh_z = 0.0;

        let mut neighbor_count = 0usize;

        self.neighbor_grid.for_each_neighbor_with_wrap(
            i,
            self.config.neighbor_radius,
            wrap_x,
            wrap_y,
            |j| {
                let dx = axis_delta(self.pos_x[j] - px, wrap_x);
                let dy = axis_delta(self.pos_y[j] - py, wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
                let dist_sq = dx * dx + dy * dy + dz * dz;

                if dist_sq <= EPSILON || dist_sq > neighbor_radius_sq {
                    return;
                }

                neighbor_count += 1;
                align_x += self.vel_x[j];
                align_y += self.vel_y[j];
                align_z += if self.z_mode_enabled {
                    self.vel_z[j]
                } else {
                    0.0
                };

                coh_x += dx;
                coh_y += dy;
                coh_z += dz;

                if dist_sq <= separation_radius_sq {
                    let inv_dist_sq = 1.0 / dist_sq.max(EPSILON);
                    sep_x -= dx * inv_dist_sq;
                    sep_y -= dy * inv_dist_sq;
                    sep_z -= dz * inv_dist_sq;
                    sep_count += 1;
                }
            },
        );

        let mut force_x = 0.0;
        let mut force_y = 0.0;
        let mut force_z = 0.0;

        if sep_count > 0 {
            let n = sep_count as f32;
            let (steer_x, steer_y, steer_z) = steer_towards_3d(
                sep_x / n,
                sep_y / n,
                sep_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += steer_x * self.config.sep_weight;
            force_y += steer_y * self.config.sep_weight;
            force_z += steer_z * self.config.sep_weight * self.z_force_scale;
        }

        if neighbor_count > 0 {
            let n = neighbor_count as f32;

            let (align_force_x, align_force_y, align_force_z) = steer_towards_3d(
                align_x / n,
                align_y / n,
                align_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += align_force_x * self.config.align_weight;
            force_y += align_force_y * self.config.align_weight;
            force_z += align_force_z * self.config.align_weight * self.z_force_scale;

            let (coh_force_x, coh_force_y, coh_force_z) = steer_towards_3d(
                coh_x / n,
                coh_y / n,
                coh_z / n,
                vx,
                vy,
                if self.z_mode_enabled { vz } else { 0.0 },
                self.config.max_speed,
            );
            force_x += coh_force_x * self.config.coh_weight;
            force_y += coh_force_y * self.config.coh_weight;
            force_z += coh_force_z * self.config.coh_weight * self.z_force_scale;
        }

        if !self.z_mode_enabled {
            force_z = 0.0;
        }

        limit_magnitude_3d(force_x, force_y, force_z, self.config.max_force)
    }

    fn debug_validate_state(&self) {
        #[cfg(debug_assertions)]
        for i in 0..self.count {
            debug_assert!(self.pos_x[i].is_finite());
            debug_assert!(self.pos_y[i].is_finite());
            debug_assert!(self.pos_z[i].is_finite());
            debug_assert!(self.vel_x[i].is_finite());
            debug_assert!(self.vel_y[i].is_finite());
            debug_assert!(self.vel_z[i].is_finite());
            debug_assert!(self.accel_x[i].is_finite());
            debug_assert!(self.accel_y[i].is_finite());
            debug_assert!(self.accel_z[i].is_finite());
            debug_assert!((0.0..=1.0).contains(&self.pos_x[i]));
            debug_assert!((0.0..=1.0).contains(&self.pos_y[i]));
            debug_assert!((0.0..=1.0).contains(&self.pos_z[i]));
            debug_assert!(self.render_z[i].is_finite());
        }
    }
}

fn axis_delta(delta: f32, wrap: bool) -> f32 {
    if wrap {
        shortest_wrapped_delta(delta)
    } else {
        delta
    }
}

fn shortest_wrapped_delta(delta: f32) -> f32 {
    if delta > 0.5 {
        delta - 1.0
    } else if delta < -0.5 {
        delta + 1.0
    } else {
        delta
    }
}

fn integrate_axis(position: f32, velocity: f32, dt: f32, bounce: bool) -> (f32, f32) {
    if !bounce {
        return ((position + velocity * dt).rem_euclid(WORLD_SIZE), velocity);
    }

    let mut next_position = position + velocity * dt;
    let mut next_velocity = velocity;

    // Multiple reflections are unlikely with the current dt/speed caps, but this
    // guards against pathological inputs while keeping behavior deterministic.
    for _ in 0..4 {
        if (0.0..=WORLD_SIZE).contains(&next_position) {
            break;
        }

        if next_position < 0.0 {
            next_position = -next_position;
            next_velocity = -next_velocity;
            continue;
        }

        if next_position > WORLD_SIZE {
            next_position = WORLD_SIZE * 2.0 - next_position;
            next_velocity = -next_velocity;
        }
    }

    (next_position.clamp(0.0, WORLD_SIZE), next_velocity)
}

#[allow(clippy::too_many_arguments)]
fn steer_towards_3d(
    desired_x: f32,
    desired_y: f32,
    desired_z: f32,
    current_vx: f32,
    current_vy: f32,
    current_vz: f32,
    max_speed: f32,
) -> (f32, f32, f32) {
    let desired_mag_sq = desired_x * desired_x + desired_y * desired_y + desired_z * desired_z;
    if desired_mag_sq <= EPSILON {
        return (0.0, 0.0, 0.0);
    }

    let desired_mag = desired_mag_sq.sqrt();
    let scale = max_speed / desired_mag;
    let target_x = desired_x * scale;
    let target_y = desired_y * scale;
    let target_z = desired_z * scale;

    (
        target_x - current_vx,
        target_y - current_vy,
        target_z - current_vz,
    )
}

fn limit_magnitude_3d(x: f32, y: f32, z: f32, max_magnitude: f32) -> (f32, f32, f32) {
    if max_magnitude <= 0.0 {
        return (0.0, 0.0, 0.0);
    }

    let mag_sq = x * x + y * y + z * z;
    let max_sq = max_magnitude * max_magnitude;

    if mag_sq <= max_sq {
        return (x, y, z);
    }

    let scale = max_magnitude / mag_sq.sqrt();
    (x * scale, y * scale, z * scale)
}

fn clamp_finite(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if !value.is_finite() {
        return fallback;
    }

    value.clamp(min, max)
}

#[wasm_bindgen]
pub fn wasm_loaded_message() -> String {
    "WASM loaded".to_string()
}

#[cfg(test)]
mod tests {
    use super::{Sim, DEFAULT_Z_LAYER, WORLD_SIZE};

    #[test]
    fn disabled_z_mode_keeps_particles_in_mid_layer() {
        let mut sim = Sim::new(64, 1337, 1.0, 1.0);
        sim.set_z_mode(false);
        sim.step(0.016);

        for z in &sim.pos_z {
            assert_eq!(*z, DEFAULT_Z_LAYER);
        }
        for vz in &sim.vel_z {
            assert_eq!(*vz, 0.0);
        }
    }

    #[test]
    fn enabled_z_mode_updates_depth_and_stays_wrapped() {
        let mut sim = Sim::new(64, 42, 1.0, 1.0);
        sim.set_z_mode(true);
        sim.step(0.016);

        let mut any_off_mid_layer = false;
        for z in &sim.render_z {
            assert!(z.is_finite());
            assert!((0.0..=WORLD_SIZE).contains(z));
            if (*z - DEFAULT_Z_LAYER).abs() > 1.0e-4 {
                any_off_mid_layer = true;
            }
        }

        assert!(any_off_mid_layer);
    }

    #[test]
    fn bounce_mode_reflects_velocity() {
        let mut sim = Sim::new(1, 7, 1.0, 1.0);
        sim.set_axis_bounce(true, false, false);
        sim.pos_x[0] = 0.01;
        sim.vel_x[0] = -0.2;
        sim.vel_y[0] = 0.0;

        sim.step(0.1);

        assert!((0.0..=WORLD_SIZE).contains(&sim.pos_x[0]));
        assert!(sim.vel_x[0] > 0.0);
    }

    #[test]
    fn wrap_mode_keeps_velocity_sign() {
        let mut sim = Sim::new(1, 11, 1.0, 1.0);
        sim.set_axis_bounce(true, false, false);
        sim.pos_y[0] = 0.01;
        sim.vel_x[0] = 0.0;
        sim.vel_y[0] = -0.2;

        sim.step(0.1);

        assert!((0.0..=WORLD_SIZE).contains(&sim.pos_y[0]));
        assert!(sim.vel_y[0] < 0.0);
    }

    #[test]
    fn z_axis_can_bounce_independently() {
        let mut sim = Sim::new(1, 17, 1.0, 1.0);
        sim.set_z_mode(true);
        sim.set_axis_bounce(false, false, true);
        sim.pos_z[0] = 0.01;
        sim.vel_x[0] = 0.0;
        sim.vel_y[0] = 0.0;
        sim.vel_z[0] = -0.2;

        sim.step(0.1);

        assert!((0.0..=WORLD_SIZE).contains(&sim.pos_z[0]));
        assert!(sim.vel_z[0] > 0.0);
    }
}
