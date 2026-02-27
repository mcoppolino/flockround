/// <reference types="vite/client" />

declare module "../../sim-wasm/pkg/sim_wasm.js" {
  const init: () => Promise<{ memory: WebAssembly.Memory }>;
  export default init;
  export class Sim {
    constructor(count: number, seed: number, width: number, height: number);
    set_config(
      sepWeight: number,
      alignWeight: number,
      cohWeight: number,
      neighborRadius: number,
      separationRadius: number,
      minSpeed: number,
      maxSpeed: number,
      maxForce: number,
    ): void;
    step(dt: number): void;
    set_bounds(width: number, height: number): void;
    set_bounce_bounds(enabled: boolean): void;
    bounce_bounds(): boolean;
    set_axis_bounce(bounceX: boolean, bounceY: boolean, bounceZ: boolean): void;
    bounce_x(): boolean;
    bounce_y(): boolean;
    bounce_z(): boolean;
    set_z_mode(enabled: boolean): void;
    z_mode_enabled(): boolean;
    set_z_force_scale(scale: number): void;
    count(): number;
    render_xy_ptr(): number;
    render_xy_len(): number;
    render_z_ptr(): number;
    render_z_len(): number;
  }
  export function wasm_loaded_message(): string;
}
