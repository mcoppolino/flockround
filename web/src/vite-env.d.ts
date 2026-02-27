/// <reference types="vite/client" />

declare module "../../sim-wasm/pkg/sim_wasm.js" {
  const init: () => Promise<{ memory: WebAssembly.Memory }>;
  export default init;
  export class Sim {
    constructor(count: number, seed: number, width: number, height: number);
    step(dt: number): void;
    set_bounds(width: number, height: number): void;
    count(): number;
    render_xy_ptr(): number;
    render_xy_len(): number;
  }
  export function wasm_loaded_message(): string;
}
