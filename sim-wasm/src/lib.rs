mod math;
mod neighbor_grid;

use math::MathMode;
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
const DEFAULT_MAX_FORCE: f32 = 0.42;
const MIN_Z_FORCE_SCALE: f32 = 0.0;
const MAX_Z_FORCE_SCALE: f32 = 2.0;
const DEFAULT_Z_FORCE_SCALE: f32 = 0.75;
const MIN_MIN_DISTANCE: f32 = 0.0;
const MAX_MIN_DISTANCE: f32 = 1.0;
const DEFAULT_SOFT_MIN_DISTANCE: f32 = 0.008;
const DEFAULT_HARD_MIN_DISTANCE: f32 = 0.0;
const MIN_JITTER_STRENGTH: f32 = 0.0;
const MAX_JITTER_STRENGTH: f32 = 1.0;
const DEFAULT_JITTER_STRENGTH: f32 = 0.01;
const MIN_DRAG: f32 = 0.0;
const MAX_DRAG: f32 = 6.0;
const DEFAULT_DRAG: f32 = 0.0;
const HARD_CONSTRAINT_RELAXATION: f32 = 0.05;
const HARD_CONSTRAINT_MAX_PUSH: f32 = 0.0025;

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
    math_mode: MathMode,
    max_neighbors_sampled: usize,
    soft_min_distance: f32,
    hard_min_distance: f32,
    jitter_strength: f32,
    drag: f32,
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
            max_force: DEFAULT_MAX_FORCE,
            math_mode: MathMode::Accurate,
            max_neighbors_sampled: 0,
            soft_min_distance: DEFAULT_SOFT_MIN_DISTANCE,
            hard_min_distance: DEFAULT_HARD_MIN_DISTANCE,
            jitter_strength: DEFAULT_JITTER_STRENGTH,
            drag: DEFAULT_DRAG,
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

        self.max_force = clamp_finite(
            self.max_force,
            MIN_MAX_FORCE,
            MAX_MAX_FORCE,
            DEFAULT_MAX_FORCE,
        );
        self.soft_min_distance = clamp_finite(
            self.soft_min_distance,
            MIN_MIN_DISTANCE,
            MAX_MIN_DISTANCE,
            DEFAULT_SOFT_MIN_DISTANCE,
        );
        self.hard_min_distance = clamp_finite(
            self.hard_min_distance,
            MIN_MIN_DISTANCE,
            MAX_MIN_DISTANCE,
            DEFAULT_HARD_MIN_DISTANCE,
        );
        self.jitter_strength = clamp_finite(
            self.jitter_strength,
            MIN_JITTER_STRENGTH,
            MAX_JITTER_STRENGTH,
            DEFAULT_JITTER_STRENGTH,
        );
        self.drag = clamp_finite(self.drag, MIN_DRAG, MAX_DRAG, DEFAULT_DRAG);
    }
}

#[wasm_bindgen]
pub struct Sim {
    count: usize,
    active_count: usize,
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
    neighbors_visited_last_step: usize,
    step_index: u32,
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
            active_count: count,
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
            neighbors_visited_last_step: 0,
            step_index: 0,
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
            math_mode: self.config.math_mode,
            max_neighbors_sampled: self.config.max_neighbors_sampled,
            soft_min_distance: self.config.soft_min_distance,
            hard_min_distance: self.config.hard_min_distance,
            jitter_strength: self.config.jitter_strength,
            drag: self.config.drag,
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

    pub fn set_math_mode(&mut self, mode: u32) {
        self.config.math_mode = MathMode::from_u32(mode);
    }

    pub fn math_mode(&self) -> u32 {
        self.config.math_mode.as_u32()
    }

    pub fn set_max_neighbors_sampled(&mut self, max_neighbors: usize) {
        self.config.max_neighbors_sampled = max_neighbors;
    }

    pub fn max_neighbors_sampled(&self) -> usize {
        self.config.max_neighbors_sampled
    }

    pub fn neighbors_visited_last_step(&self) -> usize {
        self.neighbors_visited_last_step
    }

    pub fn set_max_force(&mut self, max_force: f32) {
        self.config.max_force = clamp_finite(
            max_force,
            MIN_MAX_FORCE,
            MAX_MAX_FORCE,
            DEFAULT_MAX_FORCE,
        );
    }

    pub fn max_force(&self) -> f32 {
        self.config.max_force
    }

    pub fn set_min_distance(&mut self, min_distance: f32) {
        self.config.soft_min_distance = clamp_finite(
            min_distance,
            MIN_MIN_DISTANCE,
            MAX_MIN_DISTANCE,
            DEFAULT_SOFT_MIN_DISTANCE,
        );
    }

    pub fn min_distance(&self) -> f32 {
        self.config.soft_min_distance
    }

    pub fn set_hard_min_distance(&mut self, min_distance: f32) {
        self.config.hard_min_distance = clamp_finite(
            min_distance,
            MIN_MIN_DISTANCE,
            MAX_MIN_DISTANCE,
            DEFAULT_HARD_MIN_DISTANCE,
        );
    }

    pub fn hard_min_distance(&self) -> f32 {
        self.config.hard_min_distance
    }

    pub fn set_jitter_strength(&mut self, jitter_strength: f32) {
        self.config.jitter_strength = clamp_finite(
            jitter_strength,
            MIN_JITTER_STRENGTH,
            MAX_JITTER_STRENGTH,
            DEFAULT_JITTER_STRENGTH,
        );
    }

    pub fn jitter_strength(&self) -> f32 {
        self.config.jitter_strength
    }

    pub fn set_drag(&mut self, drag: f32) {
        self.config.drag = clamp_finite(drag, MIN_DRAG, MAX_DRAG, DEFAULT_DRAG);
    }

    pub fn drag(&self) -> f32 {
        self.config.drag
    }

    pub fn step(&mut self, dt: f32) {
        let dt = dt.clamp(DT_MIN, DT_MAX);
        if dt <= 0.0 || self.active_count == 0 {
            self.neighbors_visited_last_step = 0;
            return;
        }

        self.step_index = self.step_index.wrapping_add(1);
        self.neighbors_visited_last_step = 0;

        // If steering cannot produce non-zero acceleration, skip neighbor/force work.
        let steering_disabled = self.config.max_force <= EPSILON
            || ((self.config.sep_weight <= EPSILON
                && self.config.align_weight <= EPSILON
                && self.config.coh_weight <= EPSILON)
                && self.config.jitter_strength <= EPSILON);
        let drag_damping = if self.config.drag <= EPSILON {
            1.0
        } else {
            (-self.config.drag * dt).exp()
        };

        if steering_disabled {
            for i in 0..self.active_count {
                let vx = self.vel_x[i] * drag_damping;
                let vy = self.vel_y[i] * drag_damping;
                let vz = if self.z_mode_enabled {
                    self.vel_z[i] * drag_damping
                } else {
                    0.0
                };

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
            }

            self.resolve_hard_min_distance_constraints();
            self.sync_render_buffers();
            self.debug_validate_state();
            return;
        }

        self.neighbor_grid
            .set_cell_size(self.config.neighbor_radius);
        self.neighbor_grid
            .rebuild(
                &self.pos_x[..self.active_count],
                &self.pos_y[..self.active_count],
                WORLD_SIZE,
                WORLD_SIZE,
            );

        for i in 0..self.active_count {
            let (ax, ay, az, neighbors_used) = self.compute_boids_acceleration(i);
            self.accel_x[i] = ax;
            self.accel_y[i] = ay;
            self.accel_z[i] = az;
            self.neighbors_visited_last_step += neighbors_used;
        }

        for i in 0..self.active_count {
            let mut vx = (self.vel_x[i] + self.accel_x[i] * dt) * drag_damping;
            let mut vy = (self.vel_y[i] + self.accel_y[i] * dt) * drag_damping;
            let mut vz = if self.z_mode_enabled {
                (self.vel_z[i] + self.accel_z[i] * dt) * drag_damping
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
                let min_speed_sq = self.config.min_speed * self.config.min_speed;
                let max_speed_sq = self.config.max_speed * self.config.max_speed;
                if speed_sq < min_speed_sq {
                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        self.config.min_speed,
                    );
                    vx = nvx;
                    vy = nvy;
                    if self.z_mode_enabled {
                        vz = nvz;
                    }
                } else if speed_sq > max_speed_sq {
                    let (nvx, nvy, nvz) = math::normalize_to_magnitude(
                        self.config.math_mode,
                        vx,
                        vy,
                        if self.z_mode_enabled { vz } else { 0.0 },
                        self.config.max_speed,
                    );
                    vx = nvx;
                    vy = nvy;
                    if self.z_mode_enabled {
                        vz = nvz;
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
        }

        self.resolve_hard_min_distance_constraints();
        self.sync_render_buffers();
        self.debug_validate_state();
    }

    pub fn set_bounds(&mut self, width: f32, height: f32) {
        self.width = width.max(MIN_BOUND);
        self.height = height.max(MIN_BOUND);
    }

    pub fn set_active_count(&mut self, active_count: usize) {
        self.active_count = active_count.min(self.count);
    }

    pub fn active_count(&self) -> usize {
        self.active_count
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
    fn resolve_hard_min_distance_constraints(&mut self) {
        let hard_min_distance = self.config.hard_min_distance;
        if hard_min_distance <= EPSILON || self.active_count < 2 {
            return;
        }

        let wrap_x = !self.bounce_x;
        let wrap_y = !self.bounce_y;
        let wrap_z = !self.bounce_z;
        let min_distance_sq = hard_min_distance * hard_min_distance;

        self.neighbor_grid.set_cell_size(hard_min_distance);
        self.neighbor_grid
            .rebuild(
                &self.pos_x[..self.active_count],
                &self.pos_y[..self.active_count],
                WORLD_SIZE,
                WORLD_SIZE,
            );

        let mut neighbors = Vec::new();
        for i in 0..self.active_count {
            neighbors.clear();
            self.neighbor_grid.for_each_neighbor_with_wrap(
                i,
                hard_min_distance,
                wrap_x,
                wrap_y,
                |j| {
                    if j > i && !neighbors.contains(&j) {
                        neighbors.push(j);
                    }
                    true
                },
            );

            for &j in &neighbors {
                let dx = axis_delta(self.pos_x[j] - self.pos_x[i], wrap_x);
                let dy = axis_delta(self.pos_y[j] - self.pos_y[i], wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - self.pos_z[i], wrap_z)
                } else {
                    0.0
                };
                let dist_sq = math::distance_sq_3d(dx, dy, dz);
                if dist_sq >= min_distance_sq {
                    continue;
                }

                let (nx, ny, nz, dist) = if dist_sq > EPSILON {
                    let dist = dist_sq.sqrt();
                    (dx / dist, dy / dist, if self.z_mode_enabled { dz / dist } else { 0.0 }, dist)
                } else {
                    let mut nx = hash_unit(self.step_index, i as u32, 0);
                    let mut ny = hash_unit(self.step_index, j as u32, 1);
                    let mut nz = if self.z_mode_enabled {
                        hash_unit(self.step_index, (i ^ j) as u32, 2)
                    } else {
                        0.0
                    };
                    let len_sq = nx * nx + ny * ny + nz * nz;
                    if len_sq > EPSILON {
                        let inv_len = 1.0 / len_sq.sqrt();
                        nx *= inv_len;
                        ny *= inv_len;
                        nz *= inv_len;
                    } else {
                        nx = 1.0;
                        ny = 0.0;
                        nz = 0.0;
                    }
                    (nx, ny, nz, 0.0)
                };

                let push = ((hard_min_distance - dist) * 0.5 * HARD_CONSTRAINT_RELAXATION)
                    .min(HARD_CONSTRAINT_MAX_PUSH);
                if push <= 0.0 {
                    continue;
                }

                self.pos_x[i] = project_axis_position(self.pos_x[i] - nx * push, self.bounce_x);
                self.pos_y[i] = project_axis_position(self.pos_y[i] - ny * push, self.bounce_y);
                self.pos_x[j] = project_axis_position(self.pos_x[j] + nx * push, self.bounce_x);
                self.pos_y[j] = project_axis_position(self.pos_y[j] + ny * push, self.bounce_y);

                if self.z_mode_enabled {
                    self.pos_z[i] = project_axis_position(self.pos_z[i] - nz * push, self.bounce_z);
                    self.pos_z[j] = project_axis_position(self.pos_z[j] + nz * push, self.bounce_z);
                }
            }
        }
    }

    fn sync_render_buffers(&mut self) {
        for i in 0..self.active_count {
            let base = 2 * i;
            self.render_xy[base] = self.pos_x[i];
            self.render_xy[base + 1] = self.pos_y[i];
            self.render_z[i] = self.pos_z[i];
        }
    }

    fn compute_boids_acceleration(&self, i: usize) -> (f32, f32, f32, usize) {
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
        let min_distance_sq = self.config.soft_min_distance * self.config.soft_min_distance;

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
        let mut neighbor_samples = 0usize;
        let sample_cap = self.config.max_neighbors_sampled;

        self.neighbor_grid.for_each_neighbor_with_wrap(
            i,
            self.config.neighbor_radius,
            wrap_x,
            wrap_y,
            |j| {
                if sample_cap > 0 && neighbor_samples >= sample_cap {
                    return false;
                }
                neighbor_samples += 1;

                let dx = axis_delta(self.pos_x[j] - px, wrap_x);
                let dy = axis_delta(self.pos_y[j] - py, wrap_y);
                let dz = if self.z_mode_enabled {
                    axis_delta(self.pos_z[j] - pz, wrap_z)
                } else {
                    0.0
                };
                let dist_sq = math::distance_sq_3d(dx, dy, dz);

                if dist_sq <= EPSILON || dist_sq > neighbor_radius_sq {
                    return true;
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

                    if min_distance_sq > EPSILON && dist_sq < min_distance_sq {
                        let hard_push_mag =
                            self.config.soft_min_distance * (1.0 - dist_sq / min_distance_sq);
                        let (hard_x, hard_y, hard_z) = math::normalize_to_magnitude(
                            self.config.math_mode,
                            -dx,
                            -dy,
                            if self.z_mode_enabled { -dz } else { 0.0 },
                            hard_push_mag,
                        );
                        sep_x += hard_x;
                        sep_y += hard_y;
                        sep_z += hard_z;
                    }

                    sep_count += 1;
                }

                true
            },
        );

        let mut force_x = 0.0;
        let mut force_y = 0.0;
        let mut force_z = 0.0;

        if sep_count > 0 {
            let n = sep_count as f32;
            let (steer_x, steer_y, steer_z) = steer_towards_3d(
                self.config.math_mode,
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
                self.config.math_mode,
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
                self.config.math_mode,
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

        if self.config.jitter_strength > 0.0 {
            force_x += hash_unit(self.step_index, i as u32, 0) * self.config.jitter_strength;
            force_y += hash_unit(self.step_index, i as u32, 1) * self.config.jitter_strength;
            if self.z_mode_enabled {
                force_z += hash_unit(self.step_index, i as u32, 2) * self.config.jitter_strength;
            }
        }

        let (fx, fy, fz) = math::limit_magnitude_3d(
            self.config.math_mode,
            force_x,
            force_y,
            force_z,
            self.config.max_force,
        );

        (fx, fy, fz, neighbor_count)
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

fn project_axis_position(position: f32, bounce: bool) -> f32 {
    if bounce {
        position.clamp(0.0, WORLD_SIZE)
    } else {
        position.rem_euclid(WORLD_SIZE)
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
    mode: MathMode,
    desired_x: f32,
    desired_y: f32,
    desired_z: f32,
    current_vx: f32,
    current_vy: f32,
    current_vz: f32,
    max_speed: f32,
) -> (f32, f32, f32) {
    let (target_x, target_y, target_z) =
        math::normalize_to_magnitude(mode, desired_x, desired_y, desired_z, max_speed);

    (
        target_x - current_vx,
        target_y - current_vy,
        target_z - current_vz,
    )
}

fn clamp_finite(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if !value.is_finite() {
        return fallback;
    }

    value.clamp(min, max)
}

fn hash_unit(step_index: u32, particle_index: u32, axis: u32) -> f32 {
    let mut x = step_index
        .wrapping_mul(0x9E37_79B9)
        .wrapping_add(particle_index.wrapping_mul(0x85EB_CA6B))
        .wrapping_add(axis.wrapping_mul(0xC2B2_AE35))
        .wrapping_add(0x27D4_EB2F);

    x ^= x >> 15;
    x = x.wrapping_mul(0x85EB_CA6B);
    x ^= x >> 13;
    x = x.wrapping_mul(0xC2B2_AE35);
    x ^= x >> 16;

    let normalized = (x as f32) / (u32::MAX as f32);
    normalized * 2.0 - 1.0
}

#[wasm_bindgen]
pub fn wasm_loaded_message() -> String {
    "WASM loaded".to_string()
}

#[cfg(test)]
mod tests {
    use super::{shortest_wrapped_delta, Sim, DEFAULT_Z_LAYER, WORLD_SIZE};

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

    #[test]
    fn fast_math_mode_stays_stable() {
        let mut sim = Sim::new(128, 99, 1.0, 1.0);
        sim.set_z_mode(true);
        sim.set_math_mode(1);
        sim.step(0.016);

        for i in 0..sim.count() {
            assert!(sim.pos_x[i].is_finite());
            assert!(sim.pos_y[i].is_finite());
            assert!(sim.pos_z[i].is_finite());
        }
    }

    #[test]
    fn neighbor_sampling_cap_limits_work() {
        let mut sim = Sim::new(256, 2026, 1.0, 1.0);
        sim.set_max_neighbors_sampled(2);
        sim.step(0.016);

        assert!(sim.neighbors_visited_last_step() <= sim.count() * 2);
    }

    #[test]
    fn min_distance_is_enforced_as_hard_floor() {
        let mut sim = Sim::new(2, 123, 1.0, 1.0);
        sim.set_z_mode(false);
        sim.set_axis_bounce(false, false, false);
        sim.set_max_force(0.0);
        sim.set_hard_min_distance(0.2);
        sim.set_min_distance(0.0);

        sim.pos_x[0] = 0.5;
        sim.pos_y[0] = 0.5;
        sim.pos_x[1] = 0.5;
        sim.pos_y[1] = 0.5;
        sim.vel_x[0] = 0.0;
        sim.vel_y[0] = 0.0;
        sim.vel_x[1] = 0.0;
        sim.vel_y[1] = 0.0;

        for _ in 0..2_000 {
            sim.step(0.016);
        }

        let dx = shortest_wrapped_delta(sim.pos_x[1] - sim.pos_x[0]);
        let dy = shortest_wrapped_delta(sim.pos_y[1] - sim.pos_y[0]);
        let dist = (dx * dx + dy * dy).sqrt();
        assert!(
            dist + 2.0e-3 >= sim.hard_min_distance(),
            "dist={dist}, hard_min_distance={}",
            sim.hard_min_distance()
        );
    }

    #[test]
    fn soft_and_hard_min_distance_are_independent() {
        let mut sim = Sim::new(2, 5, 1.0, 1.0);
        sim.set_min_distance(0.12);
        sim.set_hard_min_distance(0.34);

        assert!((sim.min_distance() - 0.12).abs() < 1.0e-6);
        assert!((sim.hard_min_distance() - 0.34).abs() < 1.0e-6);
    }
}
