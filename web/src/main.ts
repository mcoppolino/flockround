import { DEFAULT_FLOCK_THEME, FlockView } from "./render";
import { initWasmModule, type SimMathMode } from "./wasm";
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
  let mathMode: SimMathMode = "accurate";
  let fastModeNeighborCap = 24;

  sim.setZMode(zEnabled);
  sim.setZForceScale(0.75);
  sim.setAxisBounce(bounceX, bounceY, bounceZ);
  sim.setMathMode(mathMode);
  sim.setMaxNeighborsSampled(0);

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  view.setTheme(DEFAULT_FLOCK_THEME);
  const controls = createDebugControls(host);

  const applyAxisBounds = (): void => {
    sim.setAxisBounce(bounceX, bounceY, bounceZ);
  };

  const applyMathSettings = (): void => {
    sim.setMathMode(mathMode);
    sim.setMaxNeighborsSampled(mathMode === "fast" ? fastModeNeighborCap : 0);
  };

  const updateDebugState = (): void => {
    controls.xBoundsButton.textContent = bounceX ? "X: Bounce" : "X: Wrap";
    controls.yBoundsButton.textContent = bounceY ? "Y: Bounce" : "Y: Wrap";
    controls.zBoundsButton.textContent = bounceZ ? "Z: Bounce" : "Z: Wrap";
    controls.zModeButton.textContent = zEnabled ? "Z Mode: On" : "Z Mode: Off";
    controls.mathModeButton.textContent =
      mathMode === "fast"
        ? `Math: Fast (k=${fastModeNeighborCap})`
        : "Math: Accurate (k=∞)";
    controls.kValueLabel.textContent = `k=${fastModeNeighborCap}`;
    controls.kSlider.value = String(fastModeNeighborCap);
    setButtonState(controls.xBoundsButton, bounceX);
    setButtonState(controls.yBoundsButton, bounceY);
    setButtonState(controls.zBoundsButton, bounceZ);
    setButtonState(controls.zModeButton, zEnabled);
    setButtonState(controls.mathModeButton, mathMode === "fast");
    controls.kSlider.disabled = mathMode !== "fast";
    controls.kSlider.style.opacity = mathMode === "fast" ? "1" : "0.55";
    controls.kValueLabel.style.opacity = mathMode === "fast" ? "1" : "0.55";
  };
  updateDebugState();

  controls.xBoundsButton.addEventListener("click", () => {
    bounceX = !bounceX;
    applyAxisBounds();
    updateDebugState();
  });

  controls.yBoundsButton.addEventListener("click", () => {
    bounceY = !bounceY;
    applyAxisBounds();
    updateDebugState();
  });

  controls.zBoundsButton.addEventListener("click", () => {
    bounceZ = !bounceZ;
    applyAxisBounds();
    updateDebugState();
  });

  controls.zModeButton.addEventListener("click", () => {
    zEnabled = !zEnabled;
    sim.setZMode(zEnabled);
    updateDebugState();
  });

  controls.mathModeButton.addEventListener("click", () => {
    mathMode = mathMode === "fast" ? "accurate" : "fast";
    applyMathSettings();
    updateDebugState();
  });

  controls.kSlider.addEventListener("input", () => {
    fastModeNeighborCap = Number.parseInt(controls.kSlider.value, 10);
    applyMathSettings();
    updateDebugState();
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

function createDebugControls(host: HTMLElement): {
  xBoundsButton: HTMLButtonElement;
  yBoundsButton: HTMLButtonElement;
  zBoundsButton: HTMLButtonElement;
  zModeButton: HTMLButtonElement;
  mathModeButton: HTMLButtonElement;
  kSlider: HTMLInputElement;
  kValueLabel: HTMLSpanElement;
} {
  const panel = document.createElement("div");
  panel.className = "debug-controls";
  panel.style.position = "absolute";
  panel.style.top = "calc(env(safe-area-inset-top, 0px) + 8px)";
  panel.style.left = "calc(env(safe-area-inset-left, 0px) + 8px)";
  panel.style.zIndex = "2147483647";
  panel.style.display = "flex";
  panel.style.gap = "4px";
  panel.style.flexWrap = "wrap";
  panel.style.maxWidth = "calc(100vw - 16px)";
  panel.style.pointerEvents = "auto";

  const xBoundsButton = createDebugButton("X: Wrap");
  const yBoundsButton = createDebugButton("Y: Wrap");
  const zBoundsButton = createDebugButton("Z: Wrap");
  const zModeButton = createDebugButton("Z Mode: On");
  const mathModeButton = createDebugButton("Math: Accurate");
  const kSlider = document.createElement("input");
  kSlider.type = "range";
  kSlider.min = "4";
  kSlider.max = "64";
  kSlider.step = "1";
  kSlider.value = "24";
  kSlider.style.width = "90px";
  kSlider.style.height = "20px";
  kSlider.style.margin = "0";
  kSlider.style.cursor = "pointer";

  const kValueLabel = document.createElement("span");
  kValueLabel.textContent = "k=24";
  kValueLabel.style.display = "inline-flex";
  kValueLabel.style.alignItems = "center";
  kValueLabel.style.height = "20px";
  kValueLabel.style.padding = "0 4px";
  kValueLabel.style.color = "#e6f0ff";
  kValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const buttons = [xBoundsButton, yBoundsButton, zBoundsButton, zModeButton, mathModeButton];
  for (const button of buttons) {
    button.style.height = "20px";
    button.style.padding = "0 6px";
    button.style.border = "1px solid rgba(187, 208, 234, 0.65)";
    button.style.borderRadius = "4px";
    button.style.background = "rgba(6, 10, 18, 0.9)";
    button.style.color = "#e6f0ff";
    button.style.font = '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    button.style.cursor = "pointer";
    button.style.backdropFilter = "blur(1px)";
  }

  panel.append(
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    kSlider,
    kValueLabel,
  );
  host.appendChild(panel);

  return {
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    kSlider,
    kValueLabel,
  };
}

function createDebugButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "debug-button";
  button.textContent = label;
  return button;
}

function setButtonState(button: HTMLButtonElement, active: boolean): void {
  button.style.borderColor = active
    ? "rgba(133, 191, 255, 0.95)"
    : "rgba(187, 208, 234, 0.65)";
  button.style.background = active ? "rgba(21, 55, 90, 0.95)" : "rgba(6, 10, 18, 0.9)";
  button.style.color = active ? "#ffffff" : "#e6f0ff";
}
