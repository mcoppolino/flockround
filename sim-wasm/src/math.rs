const EPSILON: f32 = 1.0e-6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MathMode {
    Accurate,
    Fast,
}

impl MathMode {
    pub fn from_u32(value: u32) -> Self {
        match value {
            1 => Self::Fast,
            _ => Self::Accurate,
        }
    }

    pub fn as_u32(self) -> u32 {
        match self {
            Self::Accurate => 0,
            Self::Fast => 1,
        }
    }
}

pub fn distance_sq_3d(dx: f32, dy: f32, dz: f32) -> f32 {
    dx * dx + dy * dy + dz * dz
}

pub fn normalize_to_magnitude(
    mode: MathMode,
    x: f32,
    y: f32,
    z: f32,
    magnitude: f32,
) -> (f32, f32, f32) {
    let mag_sq = distance_sq_3d(x, y, z);
    if mag_sq <= EPSILON {
        return (0.0, 0.0, 0.0);
    }

    let inv_mag = inverse_sqrt(mode, mag_sq);
    let scale = magnitude * inv_mag;
    (x * scale, y * scale, z * scale)
}

pub fn limit_magnitude_3d(
    mode: MathMode,
    x: f32,
    y: f32,
    z: f32,
    max_magnitude: f32,
) -> (f32, f32, f32) {
    if max_magnitude <= 0.0 {
        return (0.0, 0.0, 0.0);
    }

    let mag_sq = distance_sq_3d(x, y, z);
    let max_sq = max_magnitude * max_magnitude;
    if mag_sq <= max_sq {
        return (x, y, z);
    }

    let scale = max_magnitude * inverse_sqrt(mode, mag_sq);
    (x * scale, y * scale, z * scale)
}

fn inverse_sqrt(mode: MathMode, value: f32) -> f32 {
    match mode {
        MathMode::Accurate => 1.0 / value.sqrt(),
        MathMode::Fast => fast_inverse_sqrt(value),
    }
}

// One Newton-Raphson refinement keeps this fast while staying stable enough
// for steering vectors where small precision drift is acceptable.
fn fast_inverse_sqrt(value: f32) -> f32 {
    let half = 0.5 * value;
    let mut i = value.to_bits();
    i = 0x5f37_59df_u32.wrapping_sub(i >> 1);
    let mut y = f32::from_bits(i);
    y *= 1.5 - half * y * y;
    y.max(0.0)
}

#[cfg(test)]
mod tests {
    use super::{limit_magnitude_3d, normalize_to_magnitude, MathMode};

    #[test]
    fn fast_mode_normalize_is_reasonable() {
        let (ax, ay, az) = normalize_to_magnitude(MathMode::Accurate, 3.0, 4.0, 0.0, 10.0);
        let (fx, fy, fz) = normalize_to_magnitude(MathMode::Fast, 3.0, 4.0, 0.0, 10.0);

        assert!((ax - fx).abs() < 0.2);
        assert!((ay - fy).abs() < 0.2);
        assert!((az - fz).abs() < 0.2);
    }

    #[test]
    fn limited_vector_has_expected_upper_bound() {
        let (_, _, z) = limit_magnitude_3d(MathMode::Fast, 0.0, 0.0, 10.0, 2.0);
        assert!(z <= 2.1);
    }
}
