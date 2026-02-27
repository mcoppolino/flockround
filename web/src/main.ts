import { DEFAULT_FLOCK_THEME, FlockView } from "./render";
import { initWasmModule } from "./wasm";
import "./style.css";

async function start(): Promise<void> {
  const host = document.getElementById("app");
  if (!host) {
    throw new Error("Missing #app mount point");
  }

  const sim = await initWasmModule();

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  view.setTheme(DEFAULT_FLOCK_THEME);

  const applyResize = (): void => {
    const width = Math.floor(window.innerWidth);
    const height = Math.floor(window.innerHeight);
    sim.setBounds(width, height);
    view.resize(width, height);
  };

  let pendingResize = false;
  const scheduleResize = (): void => {
    if (pendingResize) {
      return;
    }
    pendingResize = true;
    requestAnimationFrame(() => {
      pendingResize = false;
      applyResize();
    });
  };

  window.addEventListener("resize", scheduleResize);
  window.addEventListener("fullscreenchange", () => {
    scheduleResize();
    // Mac fullscreen transitions can settle after the initial resize event.
    setTimeout(scheduleResize, 120);
    setTimeout(scheduleResize, 260);
  });
  applyResize();

  let previousTime = performance.now();
  let frameCount = 0;

  const tick = (now: number): void => {
    const rawDt = (now - previousTime) / 1000;
    previousTime = now;
    const dt = Math.min(rawDt, 0.05);

    sim.step(dt);
    view.render(sim.getPositions());

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
