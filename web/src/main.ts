import { DEFAULT_FLOCK_THEME, FlockView } from "./render";
import { initWasmModule } from "./wasm";
import "./style.css";

async function start(): Promise<void> {
  const host = document.getElementById("app");
  if (!host) {
    throw new Error("Missing #app mount point");
  }

  const sim = await initWasmModule();

  let zEnabled = true;
  let bounceX = false;
  let bounceY = false;
  let bounceZ = false;

  sim.setZMode(zEnabled);
  sim.setZForceScale(0.75);
  sim.setAxisBounce(bounceX, bounceY, bounceZ);

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  view.setTheme(DEFAULT_FLOCK_THEME);
  const controls = createDebugControls();

  const updateDebugLabels = (): void => {
    controls.xBoundsButton.textContent = bounceX ? "X: Bounce" : "X: Wrap";
    controls.yBoundsButton.textContent = bounceY ? "Y: Bounce" : "Y: Wrap";
    controls.zBoundsButton.textContent = bounceZ ? "Z: Bounce" : "Z: Wrap";
    controls.zModeButton.textContent = zEnabled ? "Z Mode: On" : "Z Mode: Off";
  };
  updateDebugLabels();

  const applyAxisBounds = (): void => {
    sim.setAxisBounce(bounceX, bounceY, bounceZ);
  };

  controls.xBoundsButton.addEventListener("click", () => {
    bounceX = !bounceX;
    applyAxisBounds();
    updateDebugLabels();
  });

  controls.yBoundsButton.addEventListener("click", () => {
    bounceY = !bounceY;
    applyAxisBounds();
    updateDebugLabels();
  });

  controls.zBoundsButton.addEventListener("click", () => {
    bounceZ = !bounceZ;
    applyAxisBounds();
    updateDebugLabels();
  });

  controls.zModeButton.addEventListener("click", () => {
    zEnabled = !zEnabled;
    sim.setZMode(zEnabled);
    updateDebugLabels();
  });

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
    view.render(sim.getPositions(), zEnabled ? sim.getDepth() : undefined);

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

function createDebugControls(): {
  xBoundsButton: HTMLButtonElement;
  yBoundsButton: HTMLButtonElement;
  zBoundsButton: HTMLButtonElement;
  zModeButton: HTMLButtonElement;
} {
  const panel = document.createElement("div");
  panel.className = "debug-controls";

  const xBoundsButton = document.createElement("button");
  xBoundsButton.type = "button";
  xBoundsButton.className = "debug-button";

  const yBoundsButton = document.createElement("button");
  yBoundsButton.type = "button";
  yBoundsButton.className = "debug-button";

  const zBoundsButton = document.createElement("button");
  zBoundsButton.type = "button";
  zBoundsButton.className = "debug-button";

  const zModeButton = document.createElement("button");
  zModeButton.type = "button";
  zModeButton.className = "debug-button";

  panel.append(xBoundsButton, yBoundsButton, zBoundsButton, zModeButton);
  document.body.appendChild(panel);

  return { xBoundsButton, yBoundsButton, zBoundsButton, zModeButton };
}
