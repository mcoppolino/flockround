import { Application, Color } from "pixi.js";
import { initWasmModule } from "./wasm";
import "./style.css";

async function start(): Promise<void> {
  const host = document.getElementById("app");
  if (!host) {
    throw new Error("Missing #app mount point");
  }

  const sim = await initWasmModule();
  sim.setBounds(window.innerWidth, window.innerHeight);

  const app = new Application();
  await app.init({
    background: new Color(0x04070d),
    resizeTo: window,
    antialias: true,
  });

  host.appendChild(app.canvas);

  window.addEventListener("resize", () => {
    sim.setBounds(window.innerWidth, window.innerHeight);
  });

  let previousTime = performance.now();
  let frameCount = 0;

  const tick = (now: number): void => {
    const rawDt = (now - previousTime) / 1000;
    previousTime = now;
    const dt = Math.min(rawDt, 0.05);

    sim.step(dt);

    if (frameCount % 90 === 0) {
      const positions = sim.getPositions();
      console.log("first position", positions[0], positions[1]);
    }

    frameCount += 1;
    requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}

void start();
