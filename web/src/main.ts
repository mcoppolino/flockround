import { Application, Color } from "pixi.js";
import { initWasmModule } from "./wasm";
import "./style.css";

async function start(): Promise<void> {
  const host = document.getElementById("app");
  if (!host) {
    throw new Error("Missing #app mount point");
  }

  await initWasmModule();

  const app = new Application();
  await app.init({
    background: new Color(0x04070d),
    resizeTo: window,
    antialias: true,
  });

  host.appendChild(app.canvas);
}

void start();
