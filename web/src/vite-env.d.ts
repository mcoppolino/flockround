/// <reference types="vite/client" />

declare module "../../sim-wasm/pkg/sim_wasm.js" {
  const init: () => Promise<unknown>;
  export default init;
  export function wasm_loaded_message(): string;
}
