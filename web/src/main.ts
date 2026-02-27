import { DEFAULT_FLOCK_THEME, FlockView } from "./render";
import { initWasmModule, type SimMathMode } from "./wasm";
import "./style.css";

const MAX_FRAME_DT_SECONDS = 0.05;
const FIXED_SIM_DT_SECONDS = 1 / 120;
const MAX_SIM_STEPS_PER_FRAME = 4;
const ENABLE_FRAME_LOGS = false;
const PROFILE_WINDOW_MS = 500;

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
  let renderStride = 1;
  let profileEnabled = false;

  sim.setZMode(zEnabled);
  sim.setZForceScale(0.75);
  sim.setAxisBounce(bounceX, bounceY, bounceZ);
  sim.setMathMode(mathMode);
  sim.setMaxNeighborsSampled(0);
  const totalBoids = sim.getCount();

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  view.setTheme(DEFAULT_FLOCK_THEME);
  const controls = createDebugControls(host);
  const profiler = createLoopProfiler(controls.profileStats);

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
    controls.renderValueLabel.textContent = `draw 1/${renderStride}`;
    controls.renderSlider.value = String(renderStride);
    controls.profileButton.textContent = profileEnabled ? "Profile: On" : "Profile: Off";
    setButtonState(controls.xBoundsButton, bounceX);
    setButtonState(controls.yBoundsButton, bounceY);
    setButtonState(controls.zBoundsButton, bounceZ);
    setButtonState(controls.zModeButton, zEnabled);
    setButtonState(controls.mathModeButton, mathMode === "fast");
    setButtonState(controls.profileButton, profileEnabled);
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

  controls.renderSlider.addEventListener("input", () => {
    renderStride = Number.parseInt(controls.renderSlider.value, 10);
    updateDebugState();
  });

  controls.profileButton.addEventListener("click", () => {
    profileEnabled = !profileEnabled;
    profiler.setEnabled(profileEnabled);
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
  let accumulatorSeconds = 0;
  let frameCount = 0;
  let animationHandle = 0;
  let running = true;

  const tick = (now: number): void => {
    if (!running) {
      animationHandle = 0;
      return;
    }

    const frameStartMs = performance.now();
    const rawDt = (now - previousTime) / 1000;
    previousTime = now;
    const frameDt = Math.min(rawDt, MAX_FRAME_DT_SECONDS);
    accumulatorSeconds += frameDt;

    let simSteps = 0;
    let simMs = 0;
    while (
      accumulatorSeconds >= FIXED_SIM_DT_SECONDS &&
      simSteps < MAX_SIM_STEPS_PER_FRAME
    ) {
      const simStartMs = performance.now();
      sim.step(FIXED_SIM_DT_SECONDS);
      simMs += performance.now() - simStartMs;
      accumulatorSeconds -= FIXED_SIM_DT_SECONDS;
      simSteps += 1;
    }

    if (simSteps === MAX_SIM_STEPS_PER_FRAME) {
      accumulatorSeconds = 0;
    }

    const positions = sim.getPositions();
    const renderStartMs = performance.now();
    view.render(positions, zEnabled ? sim.getDepth() : undefined, renderStride);
    const renderMs = performance.now() - renderStartMs;
    const frameMs = performance.now() - frameStartMs;

    if (profileEnabled) {
      profiler.record(now, {
        frameMs,
        simMs,
        renderMs,
        simSteps,
        neighborsVisited: sim.getNeighborsVisitedLastStep(),
        renderedBoids: Math.ceil(totalBoids / renderStride),
        totalBoids,
      });
    }

    if (ENABLE_FRAME_LOGS && frameCount % 90 === 0) {
      console.log("first position", positions[0], positions[1]);
    }

    frameCount += 1;
    animationHandle = requestAnimationFrame(tick);
  };

  const resumeAnimation = (): void => {
    if (running && animationHandle !== 0) {
      return;
    }

    running = true;
    previousTime = performance.now();
    accumulatorSeconds = 0;
    animationHandle = requestAnimationFrame(tick);
  };

  const pauseAnimation = (): void => {
    if (!running) {
      return;
    }

    running = false;
    if (animationHandle !== 0) {
      cancelAnimationFrame(animationHandle);
      animationHandle = 0;
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pauseAnimation();
    } else {
      resumeAnimation();
    }
  });

  resumeAnimation();
}

void start();

function createDebugControls(host: HTMLElement): {
  xBoundsButton: HTMLButtonElement;
  yBoundsButton: HTMLButtonElement;
  zBoundsButton: HTMLButtonElement;
  zModeButton: HTMLButtonElement;
  mathModeButton: HTMLButtonElement;
  profileButton: HTMLButtonElement;
  kSlider: HTMLInputElement;
  kValueLabel: HTMLSpanElement;
  renderSlider: HTMLInputElement;
  renderValueLabel: HTMLSpanElement;
  profileStats: HTMLPreElement;
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
  const profileButton = createDebugButton("Profile: Off");
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

  const renderSlider = document.createElement("input");
  renderSlider.type = "range";
  renderSlider.min = "1";
  renderSlider.max = "8";
  renderSlider.step = "1";
  renderSlider.value = "1";
  renderSlider.style.width = "90px";
  renderSlider.style.height = "20px";
  renderSlider.style.margin = "0";
  renderSlider.style.cursor = "pointer";

  const renderValueLabel = document.createElement("span");
  renderValueLabel.textContent = "draw 1/1";
  renderValueLabel.style.display = "inline-flex";
  renderValueLabel.style.alignItems = "center";
  renderValueLabel.style.height = "20px";
  renderValueLabel.style.padding = "0 4px";
  renderValueLabel.style.color = "#e6f0ff";
  renderValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const profileStats = document.createElement("pre");
  profileStats.textContent = "";
  profileStats.style.display = "none";
  profileStats.style.margin = "0";
  profileStats.style.padding = "6px";
  profileStats.style.minWidth = "200px";
  profileStats.style.border = "1px solid rgba(187, 208, 234, 0.45)";
  profileStats.style.borderRadius = "4px";
  profileStats.style.background = "rgba(2, 5, 10, 0.88)";
  profileStats.style.color = "#cfe4ff";
  profileStats.style.font =
    '500 10px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  profileStats.style.whiteSpace = "pre";

  const buttons = [
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    profileButton,
  ];
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
    profileButton,
    kSlider,
    kValueLabel,
    renderSlider,
    renderValueLabel,
    profileStats,
  );
  host.appendChild(panel);

  return {
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    profileButton,
    kSlider,
    kValueLabel,
    renderSlider,
    renderValueLabel,
    profileStats,
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

type LoopProfileSample = {
  frameMs: number;
  simMs: number;
  renderMs: number;
  simSteps: number;
  neighborsVisited: number;
  renderedBoids: number;
  totalBoids: number;
};

function createLoopProfiler(output: HTMLPreElement): {
  setEnabled: (enabled: boolean) => void;
  record: (now: number, sample: LoopProfileSample) => void;
} {
  let enabled = false;
  let windowStart = performance.now();
  let frameCount = 0;
  let frameMsSum = 0;
  let frameMsMax = 0;
  let simMsSum = 0;
  let renderMsSum = 0;
  let simStepsSum = 0;
  let neighborsVisitedSum = 0;

  const resetWindow = (now: number): void => {
    windowStart = now;
    frameCount = 0;
    frameMsSum = 0;
    frameMsMax = 0;
    simMsSum = 0;
    renderMsSum = 0;
    simStepsSum = 0;
    neighborsVisitedSum = 0;
  };

  const setEnabled = (nextEnabled: boolean): void => {
    enabled = nextEnabled;
    if (!enabled) {
      output.style.display = "none";
      return;
    }

    output.style.display = "block";
    output.textContent = "profiling...";
    resetWindow(performance.now());
  };

  const record = (now: number, sample: LoopProfileSample): void => {
    if (!enabled) {
      return;
    }

    frameCount += 1;
    frameMsSum += sample.frameMs;
    frameMsMax = Math.max(frameMsMax, sample.frameMs);
    simMsSum += sample.simMs;
    renderMsSum += sample.renderMs;
    simStepsSum += sample.simSteps;
    neighborsVisitedSum += sample.neighborsVisited;

    const elapsedMs = now - windowStart;
    if (elapsedMs < PROFILE_WINDOW_MS || frameCount === 0) {
      return;
    }

    const fps = (frameCount * 1000) / elapsedMs;
    const frameAvgMs = frameMsSum / frameCount;
    const simAvgMs = simMsSum / frameCount;
    const renderAvgMs = renderMsSum / frameCount;
    const jsOtherMs = Math.max(0, frameAvgMs - simAvgMs - renderAvgMs);
    const simStepsAvg = simStepsSum / frameCount;
    const neighborsAvg = Math.round(neighborsVisitedSum / frameCount);

    output.textContent = [
      `fps ${fps.toFixed(1)}  frame ${frameAvgMs.toFixed(2)}ms`,
      `sim ${simAvgMs.toFixed(2)}ms  render ${renderAvgMs.toFixed(2)}ms`,
      `js(other) ${jsOtherMs.toFixed(2)}ms  max ${frameMsMax.toFixed(2)}ms`,
      `steps/frame ${simStepsAvg.toFixed(2)}  neighbors/frame ${neighborsAvg}`,
      `draw ${sample.renderedBoids}/${sample.totalBoids}`,
    ].join("\n");

    resetWindow(now);
  };

  return { setEnabled, record };
}
