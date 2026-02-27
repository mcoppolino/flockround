use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Sim {
    count: usize,
    width: f32,
    height: f32,
}

#[wasm_bindgen]
impl Sim {
    #[wasm_bindgen(constructor)]
    pub fn new(count: usize, _seed: u32, width: f32, height: f32) -> Sim {
        Sim {
            count,
            width,
            height,
        }
    }

    pub fn step(&mut self, _dt: f32) {
        // Task 0 intentionally stubs simulation work.
    }

    pub fn set_bounds(&mut self, width: f32, height: f32) {
        self.width = width;
        self.height = height;
    }

    pub fn count(&self) -> usize {
        self.count
    }
}

#[wasm_bindgen]
pub fn wasm_loaded_message() -> String {
    "WASM loaded".to_string()
}
