import { DEFAULT_FLOCK_THEME, FlockView } from "./render";
import { initWasmModule, type SimMathMode } from "./wasm";
import "./style.css";

const MAX_FRAME_DT_SECONDS = 0.05;
const FIXED_SIM_DT_SECONDS = 1 / 120;
const MAX_SIM_STEPS_PER_FRAME = 4;
const ENABLE_FRAME_LOGS = false;
const PROFILE_WINDOW_MS = 500;
const K_SLIDER_MIN_INDEX = 0;
const K_SLIDER_MAX_INDEX = 128;
const DRAG_UI_MAX = 6.0;
const DEFAULT_Z_ENABLED = true;
const DEFAULT_BOUNCE_X = false;
const DEFAULT_BOUNCE_Y = false;
const DEFAULT_BOUNCE_Z = true;
const DEFAULT_MATH_MODE: SimMathMode = "fast";
const DEFAULT_NEIGHBOR_CAP = 24;
const DEFAULT_RENDER_STRIDE = 1;
const DEFAULT_PROFILE_ENABLED = true;
const DEFAULT_MAX_FORCE = 0.2;
const DEFAULT_DRAG = 1.2;
const DEFAULT_MIN_DISTANCE = 0.3;
const DEFAULT_HARD_MIN_DISTANCE = 0.01;
const DEFAULT_JITTER_STRENGTH = 0.4;
const DEFAULT_ACTIVE_BIRDS = 5_000;

function sliderIndexToNeighborCap(index: number): number {
  const clampedIndex = Math.min(K_SLIDER_MAX_INDEX, Math.max(K_SLIDER_MIN_INDEX, index));
  if (clampedIndex <= 126) {
    return clampedIndex + 2;
  }
  if (clampedIndex === 127) {
    return 256;
  }
  return 0;
}

function neighborCapToSliderIndex(cap: number): number {
  if (!Number.isFinite(cap) || cap <= 0) {
    return 128;
  }

  const rounded = Math.round(cap);
  if (rounded >= 257) {
    return 128;
  }
  if (rounded >= 129) {
    return 127;
  }
  return Math.min(126, Math.max(0, rounded - 2));
}

function normalizedToRange(normalized: number, maxValue: number): number {
  return clamp01(normalized) * maxValue;
}

function rangeToNormalized(value: number, maxValue: number): number {
  if (!Number.isFinite(value) || maxValue <= 0) {
    return 0;
  }
  return clamp01(value / maxValue);
}

async function start(): Promise<void> {
  const host = document.getElementById("app");
  if (!host) {
    throw new Error("Missing #app mount point");
  }

  const sim = await initWasmModule();

  let zEnabled = DEFAULT_Z_ENABLED;
  let bounceX = DEFAULT_BOUNCE_X;
  let bounceY = DEFAULT_BOUNCE_Y;
  let bounceZ = DEFAULT_BOUNCE_Z;
  let mathMode: SimMathMode = DEFAULT_MATH_MODE;
  let neighborCap = DEFAULT_NEIGHBOR_CAP;
  let renderStride = DEFAULT_RENDER_STRIDE;
  let profileEnabled = DEFAULT_PROFILE_ENABLED;
  let maxForce = DEFAULT_MAX_FORCE;
  let drag = DEFAULT_DRAG;
  let minDistance = DEFAULT_MIN_DISTANCE;
  let hardMinDistance = DEFAULT_HARD_MIN_DISTANCE;
  let jitterStrength = DEFAULT_JITTER_STRENGTH;

  const totalBoids = sim.getCount();
  let activeBoids = Math.min(DEFAULT_ACTIVE_BIRDS, totalBoids);
  sim.setZMode(zEnabled);
  sim.setZForceScale(0.75);
  sim.setAxisBounce(bounceX, bounceY, bounceZ);
  sim.setMathMode(mathMode);
  sim.setMaxNeighborsSampled(neighborCap);
  sim.setMaxForce(maxForce);
  sim.setDrag(drag);
  sim.setMinDistance(minDistance);
  sim.setHardMinDistance(hardMinDistance);
  sim.setJitterStrength(jitterStrength);
  sim.setActiveCount(activeBoids);

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  view.setTheme(DEFAULT_FLOCK_THEME);
  const controls = createDebugControls(host, totalBoids);
  const profiler = createLoopProfiler(controls.profileStats);
  profiler.setEnabled(profileEnabled);

  const applyAxisBounds = (): void => {
    sim.setAxisBounce(bounceX, bounceY, bounceZ);
  };

  const applyMathSettings = (): void => {
    sim.setMathMode(mathMode);
    sim.setMaxNeighborsSampled(neighborCap);
    sim.setMaxForce(maxForce);
    sim.setDrag(drag);
    sim.setMinDistance(minDistance);
    sim.setHardMinDistance(hardMinDistance);
    sim.setJitterStrength(jitterStrength);
  };

  const updateDebugState = (): void => {
    controls.xBoundsButton.textContent = bounceX ? "X: Bounce" : "X: Wrap";
    controls.yBoundsButton.textContent = bounceY ? "Y: Bounce" : "Y: Wrap";
    controls.zBoundsButton.textContent = bounceZ ? "Z: Bounce" : "Z: Wrap";
    controls.zModeButton.textContent = zEnabled ? "Z Mode: On" : "Z Mode: Off";
    controls.mathModeButton.textContent =
      mathMode === "fast" ? "Math: Fast" : "Math: Accurate";
    controls.kValueLabel.textContent = neighborCap === 0 ? "k=inf" : `k=${neighborCap}`;
    controls.kSlider.value = String(neighborCapToSliderIndex(neighborCap));
    controls.birdCountValueLabel.textContent = `n=${activeBoids}/${totalBoids}`;
    controls.birdCountSlider.value = String(activeBoids);
    controls.maxForceValueLabel.textContent = `f=${maxForce.toFixed(3)}`;
    controls.maxForceSlider.value = maxForce.toFixed(3);
    const dragNorm = rangeToNormalized(drag, DRAG_UI_MAX);
    controls.dragValueLabel.textContent = `g=${dragNorm.toFixed(3)} (${drag.toFixed(3)})`;
    controls.dragSlider.value = dragNorm.toFixed(3);
    controls.renderValueLabel.textContent = `draw 1/${renderStride}`;
    controls.renderSlider.value = String(renderStride);
    controls.minDistanceValueLabel.textContent = `d=${minDistance.toFixed(3)}`;
    controls.minDistanceSlider.value = minDistance.toFixed(3);
    controls.hardMinDistanceValueLabel.textContent = `h=${hardMinDistance.toFixed(3)}`;
    controls.hardMinDistanceSlider.value = hardMinDistance.toFixed(3);
    controls.jitterValueLabel.textContent = `j=${jitterStrength.toFixed(3)}`;
    controls.jitterSlider.value = jitterStrength.toFixed(3);
    controls.profileButton.textContent = profileEnabled ? "Profile: On" : "Profile: Off";
    setButtonState(controls.xBoundsButton, bounceX);
    setButtonState(controls.yBoundsButton, bounceY);
    setButtonState(controls.zBoundsButton, bounceZ);
    setButtonState(controls.zModeButton, zEnabled);
    setButtonState(controls.mathModeButton, mathMode === "fast");
    setButtonState(controls.profileButton, profileEnabled);
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
    const sliderIndex = Number.parseInt(controls.kSlider.value, 10);
    neighborCap = sliderIndexToNeighborCap(sliderIndex);
    applyMathSettings();
    updateDebugState();
  });

  controls.birdCountSlider.addEventListener("input", () => {
    activeBoids = Number.parseInt(controls.birdCountSlider.value, 10);
    sim.setActiveCount(activeBoids);
    updateDebugState();
  });

  controls.maxForceSlider.addEventListener("input", () => {
    maxForce = Number.parseFloat(controls.maxForceSlider.value);
    applyMathSettings();
    updateDebugState();
  });

  controls.dragSlider.addEventListener("input", () => {
    const dragNorm = Number.parseFloat(controls.dragSlider.value);
    drag = normalizedToRange(dragNorm, DRAG_UI_MAX);
    applyMathSettings();
    updateDebugState();
  });

  controls.renderSlider.addEventListener("input", () => {
    renderStride = Number.parseInt(controls.renderSlider.value, 10);
    updateDebugState();
  });

  controls.minDistanceSlider.addEventListener("input", () => {
    minDistance = Number.parseFloat(controls.minDistanceSlider.value);
    applyMathSettings();
    updateDebugState();
  });

  controls.hardMinDistanceSlider.addEventListener("input", () => {
    hardMinDistance = Number.parseFloat(controls.hardMinDistanceSlider.value);
    applyMathSettings();
    updateDebugState();
  });

  controls.jitterSlider.addEventListener("input", () => {
    jitterStrength = Number.parseFloat(controls.jitterSlider.value);
    applyMathSettings();
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
    view.render(positions, zEnabled ? sim.getDepth() : undefined, renderStride, activeBoids);
    const renderMs = performance.now() - renderStartMs;
    const frameMs = performance.now() - frameStartMs;

    if (profileEnabled) {
      profiler.record(now, {
        frameMs,
        simMs,
        renderMs,
        simSteps,
        neighborsVisited: sim.getNeighborsVisitedLastStep(),
        renderedBoids: Math.ceil(activeBoids / renderStride),
        activeBoids,
        maxBoids: totalBoids,
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

function createDebugControls(host: HTMLElement, maxBirds: number): {
  xBoundsButton: HTMLButtonElement;
  yBoundsButton: HTMLButtonElement;
  zBoundsButton: HTMLButtonElement;
  zModeButton: HTMLButtonElement;
  mathModeButton: HTMLButtonElement;
  profileButton: HTMLButtonElement;
  kSlider: HTMLInputElement;
  kValueLabel: HTMLSpanElement;
  birdCountSlider: HTMLInputElement;
  birdCountValueLabel: HTMLSpanElement;
  maxForceSlider: HTMLInputElement;
  maxForceValueLabel: HTMLSpanElement;
  dragSlider: HTMLInputElement;
  dragValueLabel: HTMLSpanElement;
  renderSlider: HTMLInputElement;
  renderValueLabel: HTMLSpanElement;
  minDistanceSlider: HTMLInputElement;
  minDistanceValueLabel: HTMLSpanElement;
  hardMinDistanceSlider: HTMLInputElement;
  hardMinDistanceValueLabel: HTMLSpanElement;
  jitterSlider: HTMLInputElement;
  jitterValueLabel: HTMLSpanElement;
  profileStats: HTMLPreElement;
} {
  const panel = document.createElement("div");
  panel.className = "debug-controls";
  panel.style.position = "absolute";
  panel.style.top = "calc(env(safe-area-inset-top, 0px) + 8px)";
  panel.style.left = "calc(env(safe-area-inset-left, 0px) + 8px)";
  panel.style.zIndex = "2147483647";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.alignItems = "flex-start";
  panel.style.gap = "4px";
  panel.style.maxWidth = "calc(100vw - 16px)";
  panel.style.pointerEvents = "auto";

  const buttonRow = document.createElement("div");
  buttonRow.style.display = "flex";
  buttonRow.style.gap = "4px";
  buttonRow.style.flexWrap = "wrap";

  const sliderStack = document.createElement("div");
  sliderStack.style.display = "flex";
  sliderStack.style.flexDirection = "column";
  sliderStack.style.gap = "3px";

  const xBoundsButton = createDebugButton("X: Wrap");
  xBoundsButton.title = "X-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const yBoundsButton = createDebugButton("Y: Wrap");
  yBoundsButton.title = "Y-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const zBoundsButton = createDebugButton("Z: Bounce");
  zBoundsButton.title = "Z-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const zModeButton = createDebugButton("Z Mode: On");
  zModeButton.title = "Enable or disable depth simulation (3D movement).";
  const mathModeButton = createDebugButton("Math: Fast");
  mathModeButton.title = "Math path for vector ops: Accurate favors precision, Fast favors speed.";
  const profileButton = createDebugButton("Profile: On");
  profileButton.title = "Toggle runtime performance metrics overlay.";
  const defaultActiveBirds = Math.min(maxBirds, DEFAULT_ACTIVE_BIRDS);
  const kSlider = document.createElement("input");
  kSlider.type = "range";
  kSlider.min = String(K_SLIDER_MIN_INDEX);
  kSlider.max = String(K_SLIDER_MAX_INDEX);
  kSlider.step = "1";
  kSlider.value = String(neighborCapToSliderIndex(DEFAULT_NEIGHBOR_CAP));
  kSlider.style.width = "90px";
  kSlider.style.height = "20px";
  kSlider.style.margin = "0";
  kSlider.style.cursor = "pointer";
  kSlider.title = "k: max neighbors sampled per boid (inf means unbounded).";

  const kValueLabel = document.createElement("span");
  kValueLabel.textContent = `k=${DEFAULT_NEIGHBOR_CAP}`;
  kValueLabel.style.display = "inline-flex";
  kValueLabel.style.alignItems = "center";
  kValueLabel.style.height = "20px";
  kValueLabel.style.padding = "0 4px";
  kValueLabel.style.color = "#e6f0ff";
  kValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const birdCountSlider = document.createElement("input");
  birdCountSlider.type = "range";
  birdCountSlider.min = "1";
  birdCountSlider.max = String(maxBirds);
  birdCountSlider.step = "1";
  birdCountSlider.value = String(defaultActiveBirds);
  birdCountSlider.style.width = "90px";
  birdCountSlider.style.height = "20px";
  birdCountSlider.style.margin = "0";
  birdCountSlider.style.cursor = "pointer";
  birdCountSlider.title = "n: active bird count simulated and rendered.";

  const birdCountValueLabel = document.createElement("span");
  birdCountValueLabel.textContent = `n=${defaultActiveBirds}/${maxBirds}`;
  birdCountValueLabel.style.display = "inline-flex";
  birdCountValueLabel.style.alignItems = "center";
  birdCountValueLabel.style.height = "20px";
  birdCountValueLabel.style.padding = "0 4px";
  birdCountValueLabel.style.color = "#e6f0ff";
  birdCountValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const maxForceSlider = document.createElement("input");
  maxForceSlider.type = "range";
  maxForceSlider.min = "0.000";
  maxForceSlider.max = "5.000";
  maxForceSlider.step = "0.010";
  maxForceSlider.value = DEFAULT_MAX_FORCE.toFixed(3);
  maxForceSlider.style.width = "90px";
  maxForceSlider.style.height = "20px";
  maxForceSlider.style.margin = "0";
  maxForceSlider.style.cursor = "pointer";
  maxForceSlider.title =
    "f: maximum steering force magnitude cap (limit_magnitude_3d); f=0 disables steering.";

  const maxForceValueLabel = document.createElement("span");
  maxForceValueLabel.textContent = `f=${DEFAULT_MAX_FORCE.toFixed(3)}`;
  maxForceValueLabel.style.display = "inline-flex";
  maxForceValueLabel.style.alignItems = "center";
  maxForceValueLabel.style.height = "20px";
  maxForceValueLabel.style.padding = "0 4px";
  maxForceValueLabel.style.color = "#e6f0ff";
  maxForceValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const dragSlider = document.createElement("input");
  dragSlider.type = "range";
  dragSlider.min = "0.000";
  dragSlider.max = "1.000";
  dragSlider.step = "0.001";
  dragSlider.value = rangeToNormalized(DEFAULT_DRAG, DRAG_UI_MAX).toFixed(3);
  dragSlider.style.width = "90px";
  dragSlider.style.height = "20px";
  dragSlider.style.margin = "0";
  dragSlider.style.cursor = "pointer";
  dragSlider.title = "g: normalized drag 0..1 (maps to 0..6 1/s damping).";

  const dragValueLabel = document.createElement("span");
  dragValueLabel.textContent =
    `g=${rangeToNormalized(DEFAULT_DRAG, DRAG_UI_MAX).toFixed(3)} (${DEFAULT_DRAG.toFixed(3)})`;
  dragValueLabel.style.display = "inline-flex";
  dragValueLabel.style.alignItems = "center";
  dragValueLabel.style.height = "20px";
  dragValueLabel.style.padding = "0 4px";
  dragValueLabel.style.color = "#e6f0ff";
  dragValueLabel.style.font =
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
  renderSlider.title = "draw: render stride; 1 draws all boids, higher values draw fewer.";

  const renderValueLabel = document.createElement("span");
  renderValueLabel.textContent = "draw 1/1";
  renderValueLabel.style.display = "inline-flex";
  renderValueLabel.style.alignItems = "center";
  renderValueLabel.style.height = "20px";
  renderValueLabel.style.padding = "0 4px";
  renderValueLabel.style.color = "#e6f0ff";
  renderValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const minDistanceSlider = document.createElement("input");
  minDistanceSlider.type = "range";
  minDistanceSlider.min = "0.000";
  minDistanceSlider.max = "1.000";
  minDistanceSlider.step = "0.001";
  minDistanceSlider.value = DEFAULT_MIN_DISTANCE.toFixed(3);
  minDistanceSlider.style.width = "90px";
  minDistanceSlider.style.height = "20px";
  minDistanceSlider.style.margin = "0";
  minDistanceSlider.style.cursor = "pointer";
  minDistanceSlider.title = "d: soft minimum separation (boids force shaping) in world units.";

  const minDistanceValueLabel = document.createElement("span");
  minDistanceValueLabel.textContent = `d=${DEFAULT_MIN_DISTANCE.toFixed(3)}`;
  minDistanceValueLabel.style.display = "inline-flex";
  minDistanceValueLabel.style.alignItems = "center";
  minDistanceValueLabel.style.height = "20px";
  minDistanceValueLabel.style.padding = "0 4px";
  minDistanceValueLabel.style.color = "#e6f0ff";
  minDistanceValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const hardMinDistanceSlider = document.createElement("input");
  hardMinDistanceSlider.type = "range";
  hardMinDistanceSlider.min = "0.000";
  hardMinDistanceSlider.max = "1.000";
  hardMinDistanceSlider.step = "0.001";
  hardMinDistanceSlider.value = DEFAULT_HARD_MIN_DISTANCE.toFixed(3);
  hardMinDistanceSlider.style.width = "90px";
  hardMinDistanceSlider.style.height = "20px";
  hardMinDistanceSlider.style.margin = "0";
  hardMinDistanceSlider.style.cursor = "pointer";
  hardMinDistanceSlider.title =
    "h: hard post-step distance floor in world units (applied with tiny incremental corrections).";

  const hardMinDistanceValueLabel = document.createElement("span");
  hardMinDistanceValueLabel.textContent = `h=${DEFAULT_HARD_MIN_DISTANCE.toFixed(3)}`;
  hardMinDistanceValueLabel.style.display = "inline-flex";
  hardMinDistanceValueLabel.style.alignItems = "center";
  hardMinDistanceValueLabel.style.height = "20px";
  hardMinDistanceValueLabel.style.padding = "0 4px";
  hardMinDistanceValueLabel.style.color = "#e6f0ff";
  hardMinDistanceValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const jitterSlider = document.createElement("input");
  jitterSlider.type = "range";
  jitterSlider.min = "0.000";
  jitterSlider.max = "1.000";
  jitterSlider.step = "0.001";
  jitterSlider.value = DEFAULT_JITTER_STRENGTH.toFixed(3);
  jitterSlider.style.width = "90px";
  jitterSlider.style.height = "20px";
  jitterSlider.style.margin = "0";
  jitterSlider.style.cursor = "pointer";
  jitterSlider.title = "j: random steering jitter magnitude in force units.";

  const jitterValueLabel = document.createElement("span");
  jitterValueLabel.textContent = `j=${DEFAULT_JITTER_STRENGTH.toFixed(3)}`;
  jitterValueLabel.style.display = "inline-flex";
  jitterValueLabel.style.alignItems = "center";
  jitterValueLabel.style.height = "20px";
  jitterValueLabel.style.padding = "0 4px";
  jitterValueLabel.style.color = "#e6f0ff";
  jitterValueLabel.style.font =
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

  const controlHelp = document.createElement("div");
  controlHelp.style.maxWidth = "340px";
  controlHelp.style.padding = "4px 6px";
  controlHelp.style.border = "1px solid rgba(187, 208, 234, 0.3)";
  controlHelp.style.borderRadius = "4px";
  controlHelp.style.background = "rgba(2, 5, 10, 0.65)";
  controlHelp.style.color = "#c3d9f7";
  controlHelp.style.font =
    '500 9px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  controlHelp.style.whiteSpace = "pre";
  controlHelp.textContent = [
    "X/Y/Z: axis boundary mode (Wrap or Bounce)",
    "Z Mode: enable depth simulation",
    "Math: vector math mode (Accurate/Fast)",
    "k: neighbors sampled per boid (inf = uncapped)",
    "n: active bird count",
    "f: max steering force clamp",
    "g: normalized drag (0..1 -> 0..6 1/s)",
    "draw: render stride (1 = draw all boids)",
    "d: soft minimum separation distance",
    "h: hard post-step minimum distance floor",
    "j: random steering jitter",
  ].join("\n");

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

  for (const button of buttons) {
    buttonRow.appendChild(button);
  }

  const createSliderRow = (
    slider: HTMLInputElement,
    valueLabel: HTMLSpanElement,
  ): HTMLDivElement => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.append(slider, valueLabel);
    return row;
  };

  sliderStack.append(
    createSliderRow(kSlider, kValueLabel),
    createSliderRow(birdCountSlider, birdCountValueLabel),
    createSliderRow(maxForceSlider, maxForceValueLabel),
    createSliderRow(dragSlider, dragValueLabel),
    createSliderRow(renderSlider, renderValueLabel),
    createSliderRow(minDistanceSlider, minDistanceValueLabel),
    createSliderRow(hardMinDistanceSlider, hardMinDistanceValueLabel),
    createSliderRow(jitterSlider, jitterValueLabel),
  );

  panel.append(buttonRow, sliderStack, controlHelp, profileStats);
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
    birdCountSlider,
    birdCountValueLabel,
    maxForceSlider,
    maxForceValueLabel,
    dragSlider,
    dragValueLabel,
    renderSlider,
    renderValueLabel,
    minDistanceSlider,
    minDistanceValueLabel,
    hardMinDistanceSlider,
    hardMinDistanceValueLabel,
    jitterSlider,
    jitterValueLabel,
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
  activeBoids: number;
  maxBoids: number;
};

type MetricLevel = "good" | "warn" | "bad";

function metricLevelColor(level: MetricLevel): string {
  if (level === "good") {
    return "#70e08b";
  }
  if (level === "warn") {
    return "#ffd479";
  }
  return "#ff8f8f";
}

function metricLevelTag(level: MetricLevel): string {
  const color = metricLevelColor(level);
  return `<span style="color:${color};font-weight:700">[${level}]</span>`;
}

function metricValue(level: MetricLevel, text: string): string {
  const color = metricLevelColor(level);
  return `<span style="color:${color}">${text}</span>`;
}

function formatMetricLine(
  label: string,
  valueText: string,
  level: MetricLevel,
  bar?: string,
): string {
  const labelCell = label.padEnd(16, " ");
  const valueCell = metricValue(level, valueText.padStart(10, " "));
  const levelCell = metricLevelTag(level);
  if (!bar) {
    return `${labelCell} ${valueCell} ${levelCell}`;
  }
  return `${labelCell} ${valueCell} ${levelCell} ${bar}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function renderMixerBar(loadRatio: number, width = 18): string {
  const ratio = clamp01(loadRatio);
  const filled = Math.round(ratio * width);
  let bar = "";

  for (let i = 0; i < width; i += 1) {
    const zone = (i + 1) / width;
    const zoneColor =
      zone <= 0.65 ? "#70e08b" : zone <= 0.85 ? "#ffd479" : "#ff8f8f";
    const isFilled = i < filled;
    const char = isFilled ? "#" : "-";
    const alpha = isFilled ? 1 : 0.2;
    bar += `<span style="color:${zoneColor};opacity:${alpha}">${char}</span>`;
  }

  return `[${bar}]`;
}

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
    output.innerHTML = "profiling...";
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
    const neighborsPerBoid = sample.activeBoids > 0 ? neighborsAvg / sample.activeBoids : 0;

    const fpsLevel: MetricLevel = fps >= 55 ? "good" : fps >= 30 ? "warn" : "bad";
    const frameLevel: MetricLevel =
      frameAvgMs <= 16.7 ? "good" : frameAvgMs <= 33.3 ? "warn" : "bad";
    const simLevel: MetricLevel = simAvgMs <= 8 ? "good" : simAvgMs <= 16 ? "warn" : "bad";
    const renderLevel: MetricLevel =
      renderAvgMs <= 2 ? "good" : renderAvgMs <= 6 ? "warn" : "bad";
    const jsOtherLevel: MetricLevel = jsOtherMs <= 2 ? "good" : jsOtherMs <= 8 ? "warn" : "bad";
    const maxFrameLevel: MetricLevel =
      frameMsMax <= 20 ? "good" : frameMsMax <= 40 ? "warn" : "bad";
    const stepsLevel: MetricLevel =
      simStepsAvg <= 1.25 ? "good" : simStepsAvg <= 2.5 ? "warn" : "bad";
    const neighborsLevel: MetricLevel =
      neighborsPerBoid <= 24 ? "good" : neighborsPerBoid <= 64 ? "warn" : "bad";

    const fpsLoad = 1 - clamp01(fps / 60);
    const frameLoad = clamp01(frameAvgMs / 40);
    const simLoad = clamp01(simAvgMs / 20);
    const renderLoad = clamp01(renderAvgMs / 8);
    const jsOtherLoad = clamp01(jsOtherMs / 8);
    const maxFrameLoad = clamp01(frameMsMax / 50);
    const stepsLoad = clamp01(simStepsAvg / 4);
    const neighborsLoad = clamp01(neighborsPerBoid / 96);

    output.innerHTML = [
      formatMetricLine("fps", fps.toFixed(1), fpsLevel, renderMixerBar(fpsLoad)),
      formatMetricLine(
        "frame",
        `${frameAvgMs.toFixed(2)}ms`,
        frameLevel,
        renderMixerBar(frameLoad),
      ),
      formatMetricLine(
        "sim",
        `${simAvgMs.toFixed(2)}ms`,
        simLevel,
        renderMixerBar(simLoad),
      ),
      formatMetricLine(
        "render",
        `${renderAvgMs.toFixed(2)}ms`,
        renderLevel,
        renderMixerBar(renderLoad),
      ),
      formatMetricLine(
        "js(other)",
        `${jsOtherMs.toFixed(2)}ms`,
        jsOtherLevel,
        renderMixerBar(jsOtherLoad),
      ),
      formatMetricLine(
        "max frame",
        `${frameMsMax.toFixed(2)}ms`,
        maxFrameLevel,
        renderMixerBar(maxFrameLoad),
      ),
      formatMetricLine(
        "steps/frame",
        simStepsAvg.toFixed(2),
        stepsLevel,
        renderMixerBar(stepsLoad),
      ),
      formatMetricLine(
        "neighbors/frame",
        neighborsAvg.toString(),
        neighborsLevel,
        renderMixerBar(neighborsLoad),
      ),
      `draw ${sample.renderedBoids}/${sample.activeBoids} (max ${sample.maxBoids})`,
    ].join("\n");

    resetWindow(now);
  };

  return { setEnabled, record };
}
