use super::{MAX_NEIGHBOR_RADIUS, MIN_NEIGHBOR_RADIUS};

pub const FLOCK2_MAX_TOPOLOGICAL_NEIGHBORS: usize = 64;
pub const FLOCK2_MIN_TOPOLOGICAL_NEIGHBORS: usize = 1;
pub const FLOCK2_MAX_BOUNDARY_COUNT: f32 = 256.0;
pub const FLOCK2_MIN_FOV_DEG: f32 = 30.0;
pub const FLOCK2_MAX_FOV_DEG: f32 = 360.0;
pub const FLOCK2_MIN_REACTION_MS: f32 = 25.0;
pub const FLOCK2_MAX_REACTION_MS: f32 = 2_000.0;
pub const FLOCK2_MIN_DYNAMIC_STABILITY: f32 = 0.0;
pub const FLOCK2_MAX_DYNAMIC_STABILITY: f32 = 1.0;
pub const FLOCK2_MIN_MASS: f32 = 0.01;
pub const FLOCK2_MAX_MASS: f32 = 5.0;
pub const FLOCK2_MIN_WING_AREA: f32 = 0.0005;
pub const FLOCK2_MAX_WING_AREA: f32 = 1.0;
pub const FLOCK2_MIN_LIFT_FACTOR: f32 = 0.0;
pub const FLOCK2_MAX_LIFT_FACTOR: f32 = 2.0;
pub const FLOCK2_MIN_DRAG_FACTOR: f32 = 0.0;
pub const FLOCK2_MAX_DRAG_FACTOR: f32 = 2.0;
pub const FLOCK2_MIN_THRUST: f32 = 0.0;
pub const FLOCK2_MAX_THRUST: f32 = 20.0;
pub const FLOCK2_MIN_GRAVITY: f32 = 0.0;
pub const FLOCK2_MAX_GRAVITY: f32 = 30.0;
pub const FLOCK2_MIN_AIR_DENSITY: f32 = 0.1;
pub const FLOCK2_MAX_AIR_DENSITY: f32 = 3.0;
pub const FLOCK2_WORLD_SCALE: f32 = 0.02;
const EPSILON: f32 = 1.0e-6;

#[derive(Clone, Copy)]
pub struct Flock2Config {
    pub avoid_weight: f32,
    pub align_weight: f32,
    pub cohesion_weight: f32,
    pub boundary_weight: f32,
    pub boundary_count: f32,
    pub neighbor_radius: f32,
    pub topological_neighbors: usize,
    pub field_of_view_deg: f32,
    pub reaction_time_ms: f32,
    pub dynamic_stability: f32,
    pub mass: f32,
    pub wing_area: f32,
    pub lift_factor: f32,
    pub drag_factor: f32,
    pub thrust: f32,
    pub min_speed: f32,
    pub max_speed: f32,
    pub gravity: f32,
    pub air_density: f32,
}

impl Default for Flock2Config {
    fn default() -> Self {
        Self {
            avoid_weight: 0.02,
            align_weight: 0.60,
            cohesion_weight: 0.004,
            boundary_weight: 0.10,
            boundary_count: 20.0,
            neighbor_radius: 0.10,
            topological_neighbors: 7,
            field_of_view_deg: 290.0,
            reaction_time_ms: 250.0,
            dynamic_stability: 0.70,
            mass: 0.08,
            wing_area: 0.0224,
            lift_factor: 0.5714,
            drag_factor: 0.1731,
            thrust: 0.2373,
            min_speed: 5.0,
            max_speed: 18.0,
            gravity: 9.8,
            air_density: 1.225,
        }
    }
}

impl Flock2Config {
    pub fn sanitize(&mut self) {
        self.avoid_weight = clamp_finite(self.avoid_weight, 0.0, 2.0, 0.02);
        self.align_weight = clamp_finite(self.align_weight, 0.0, 2.0, 0.60);
        self.cohesion_weight = clamp_finite(self.cohesion_weight, 0.0, 2.0, 0.004);
        self.boundary_weight = clamp_finite(self.boundary_weight, 0.0, 2.0, 0.10);
        self.boundary_count =
            clamp_finite(self.boundary_count, 0.0, FLOCK2_MAX_BOUNDARY_COUNT, 20.0);
        self.neighbor_radius = clamp_finite(
            self.neighbor_radius,
            MIN_NEIGHBOR_RADIUS,
            MAX_NEIGHBOR_RADIUS,
            0.10,
        );
        self.topological_neighbors = self.topological_neighbors.clamp(
            FLOCK2_MIN_TOPOLOGICAL_NEIGHBORS,
            FLOCK2_MAX_TOPOLOGICAL_NEIGHBORS,
        );
        self.field_of_view_deg = clamp_finite(
            self.field_of_view_deg,
            FLOCK2_MIN_FOV_DEG,
            FLOCK2_MAX_FOV_DEG,
            290.0,
        );
        self.reaction_time_ms = clamp_finite(
            self.reaction_time_ms,
            FLOCK2_MIN_REACTION_MS,
            FLOCK2_MAX_REACTION_MS,
            250.0,
        );
        self.dynamic_stability = clamp_finite(
            self.dynamic_stability,
            FLOCK2_MIN_DYNAMIC_STABILITY,
            FLOCK2_MAX_DYNAMIC_STABILITY,
            0.70,
        );
        self.mass = clamp_finite(self.mass, FLOCK2_MIN_MASS, FLOCK2_MAX_MASS, 0.08);
        self.wing_area = clamp_finite(
            self.wing_area,
            FLOCK2_MIN_WING_AREA,
            FLOCK2_MAX_WING_AREA,
            0.0224,
        );
        self.lift_factor = clamp_finite(
            self.lift_factor,
            FLOCK2_MIN_LIFT_FACTOR,
            FLOCK2_MAX_LIFT_FACTOR,
            0.5714,
        );
        self.drag_factor = clamp_finite(
            self.drag_factor,
            FLOCK2_MIN_DRAG_FACTOR,
            FLOCK2_MAX_DRAG_FACTOR,
            0.1731,
        );
        self.thrust = clamp_finite(self.thrust, FLOCK2_MIN_THRUST, FLOCK2_MAX_THRUST, 0.2373);
        self.min_speed = clamp_finite(self.min_speed, 0.0, 200.0, 5.0);
        self.max_speed = clamp_finite(self.max_speed, self.min_speed.max(0.1), 250.0, 18.0);
        self.gravity = clamp_finite(self.gravity, FLOCK2_MIN_GRAVITY, FLOCK2_MAX_GRAVITY, 9.8);
        self.air_density = clamp_finite(
            self.air_density,
            FLOCK2_MIN_AIR_DENSITY,
            FLOCK2_MAX_AIR_DENSITY,
            1.225,
        );
    }

    pub fn fov_cos(self) -> f32 {
        let half_angle = (self.field_of_view_deg * 0.5).to_radians();
        half_angle.cos()
    }
}

pub fn dot3(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32) -> f32 {
    ax * bx + ay * by + az * bz
}

pub fn normalize_or_default(
    x: f32,
    y: f32,
    z: f32,
    default_x: f32,
    default_y: f32,
    default_z: f32,
) -> (f32, f32, f32) {
    let len_sq = x * x + y * y + z * z;
    if len_sq <= EPSILON {
        return (default_x, default_y, default_z);
    }
    let inv_len = 1.0 / len_sq.sqrt();
    (x * inv_len, y * inv_len, z * inv_len)
}

pub fn heading_basis(
    heading_x: f32,
    heading_y: f32,
    heading_z: f32,
) -> (f32, f32, f32, f32, f32, f32, f32, f32, f32) {
    let (fwd_x, fwd_y, fwd_z) =
        normalize_or_default(heading_x, heading_y, heading_z, 1.0, 0.0, 0.0);

    let mut up_ref = (0.0, 1.0, 0.0);
    if dot3(fwd_x, fwd_y, fwd_z, up_ref.0, up_ref.1, up_ref.2).abs() > 0.97 {
        up_ref = (0.0, 0.0, 1.0);
    }

    let (cross_rx, cross_ry, cross_rz) = cross3(up_ref.0, up_ref.1, up_ref.2, fwd_x, fwd_y, fwd_z);
    let (right_x, right_y, right_z) =
        normalize_or_default(cross_rx, cross_ry, cross_rz, 0.0, 0.0, 1.0);
    let (cross_ux, cross_uy, cross_uz) = cross3(fwd_x, fwd_y, fwd_z, right_x, right_y, right_z);
    let (up_x, up_y, up_z) = normalize_or_default(cross_ux, cross_uy, cross_uz, 0.0, 1.0, 0.0);

    (
        fwd_x, fwd_y, fwd_z, up_x, up_y, up_z, right_x, right_y, right_z,
    )
}

pub fn rotate_vector_around_axis(
    vector: (f32, f32, f32),
    axis: (f32, f32, f32),
    angle_radians: f32,
) -> (f32, f32, f32) {
    let (ux, uy, uz) = normalize_or_default(axis.0, axis.1, axis.2, 0.0, 1.0, 0.0);
    let (vx, vy, vz) = vector;
    let cos_theta = angle_radians.cos();
    let sin_theta = angle_radians.sin();
    let dot = dot3(ux, uy, uz, vx, vy, vz);
    let (cross_x, cross_y, cross_z) = cross3(ux, uy, uz, vx, vy, vz);

    (
        vx * cos_theta + cross_x * sin_theta + ux * dot * (1.0 - cos_theta),
        vy * cos_theta + cross_y * sin_theta + uy * dot * (1.0 - cos_theta),
        vz * cos_theta + cross_z * sin_theta + uz * dot * (1.0 - cos_theta),
    )
}

fn cross3(ax: f32, ay: f32, az: f32, bx: f32, by: f32, bz: f32) -> (f32, f32, f32) {
    (ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx)
}

fn clamp_finite(value: f32, min: f32, max: f32, fallback: f32) -> f32 {
    if !value.is_finite() {
        return fallback;
    }
    value.clamp(min, max)
}
