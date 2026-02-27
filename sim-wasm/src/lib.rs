use wasm_bindgen::prelude::*;

const MIN_BOUND: f32 = 1.0e-6;
const DT_MIN: f32 = 0.0;
const DT_MAX: f32 = 0.1;

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

#[wasm_bindgen]
pub struct Sim {
    count: usize,
    width: f32,
    height: f32,
    pos_x: Vec<f32>,
    pos_y: Vec<f32>,
    vel_x: Vec<f32>,
    vel_y: Vec<f32>,
    render_xy: Vec<f32>,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(count: usize, seed: u32, width: f32, height: f32) -> Sim {
        let width = width.max(MIN_BOUND);
        let height = height.max(MIN_BOUND);
        let mut rng = Lcg32::new(seed);

        let mut pos_x = vec![0.0; count];
        let mut pos_y = vec![0.0; count];
        let mut vel_x = vec![0.0; count];
        let mut vel_y = vec![0.0; count];
        let mut render_xy = vec![0.0; count * 2];

        for i in 0..count {
            pos_x[i] = rng.next_f32();
            pos_y[i] = rng.next_f32();
            vel_x[i] = (rng.next_f32() - 0.5) * 0.16 + 0.06;
            vel_y[i] = (rng.next_f32() - 0.5) * 0.16;

            let base = 2 * i;
            render_xy[base] = pos_x[i];
            render_xy[base + 1] = pos_y[i];
        }

        Sim {
            count,
            width,
            height,
            pos_x,
            pos_y,
            vel_x,
            vel_y,
            render_xy,
        }
    }

    pub fn step(&mut self, dt: f32) {
        let dt = dt.clamp(DT_MIN, DT_MAX);
        if dt <= 0.0 || self.count == 0 {
            return;
        }

        for i in 0..self.count {
            let mut x = self.pos_x[i] + self.vel_x[i] * dt;
            let mut y = self.pos_y[i] + self.vel_y[i] * dt;

            x = x.rem_euclid(1.0);
            y = y.rem_euclid(1.0);

            self.pos_x[i] = x;
            self.pos_y[i] = y;

            let base = 2 * i;
            self.render_xy[base] = x;
            self.render_xy[base + 1] = y;
        }
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
}

#[wasm_bindgen]
pub fn wasm_loaded_message() -> String {
    "WASM loaded".to_string()
}
