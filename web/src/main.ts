import {
  DEFAULT_FLOCK_THEME,
  FlockView,
  type BirdShape,
  type FlockTheme,
} from "./render";
import {
  type ClassicModelConfig,
  initWasmModule,
  type Flock2FlightConfig,
  type Flock2SocialConfig,
  type SimMathMode,
  type SimModelKind,
} from "./wasm";
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
const DEFAULT_MATH_MODE: SimMathMode = "accurate";
const DEFAULT_NEIGHBOR_CAP = 7;
const DEFAULT_MENU_OPEN = true;
const DEFAULT_MAX_FORCE = 0.15;
const DEFAULT_DRAG = 0.09;
const DEFAULT_MIN_DISTANCE = 0.5;
const DEFAULT_HARD_MIN_DISTANCE = 0.02;
const DEFAULT_JITTER_STRENGTH = 0.6;
const DEFAULT_ACTIVE_BIRDS = 1_000;
const DEFAULT_MODEL_KIND: SimModelKind = "classic";
const DEFAULT_BIRD_SIZE = DEFAULT_FLOCK_THEME.particleSize;
const DEFAULT_BIRD_OPACITY = DEFAULT_FLOCK_THEME.particleAlpha;
const DEFAULT_BIRD_SHAPE: BirdShape = DEFAULT_FLOCK_THEME.particleShape;
const DEFAULT_CLASSIC_CONFIG: ClassicModelConfig = {
  mathMode: DEFAULT_MATH_MODE,
  maxNeighborsSampled: DEFAULT_NEIGHBOR_CAP,
  maxForce: DEFAULT_MAX_FORCE,
  drag: DEFAULT_DRAG,
  minDistance: DEFAULT_MIN_DISTANCE,
  hardMinDistance: DEFAULT_HARD_MIN_DISTANCE,
  jitterStrength: DEFAULT_JITTER_STRENGTH,
};

const DEFAULT_FLOCK2_SOCIAL: Flock2SocialConfig = {
  avoidWeight: 0.02,
  alignWeight: 0.6,
  cohesionWeight: 0.004,
  boundaryWeight: 0.1,
  boundaryCount: 20,
  neighborRadius: 0.1,
  topologicalNeighbors: 7,
  fieldOfViewDeg: 290,
};

const DEFAULT_FLOCK2_FLIGHT: Flock2FlightConfig = {
  reactionTimeMs: 250,
  dynamicStability: 0.7,
  mass: 0.08,
  wingArea: 0.0224,
  liftFactor: 0.5714,
  dragFactor: 0.1731,
  thrust: 0.2373,
  minSpeed: 5,
  maxSpeed: 18,
  gravity: 9.8,
  airDensity: 1.225,
};

type PaletteSpec = {
  gradientStart: string;
  gradientMiddle: string;
  gradientEnd: string;
  particleColor: number;
  particleAlpha: number;
};

const DEFAULT_PALETTE: PaletteSpec = {
  gradientStart: "#4a3b2d",
  gradientMiddle: "#2e251d",
  gradientEnd: "#14100d",
  particleColor: 0xf3e6d4,
  particleAlpha: 0.92,
};

const RANDOM_PALETTES: PaletteSpec[] = [
  DEFAULT_PALETTE,
  {
    gradientStart: "#3f2d24",
    gradientMiddle: "#271d18",
    gradientEnd: "#120d0a",
    particleColor: 0xf2ddc6,
    particleAlpha: 0.92,
  },
  {
    gradientStart: "#2f3427",
    gradientMiddle: "#1f2319",
    gradientEnd: "#0f120c",
    particleColor: 0xe7edd9,
    particleAlpha: 0.9,
  },
  {
    gradientStart: "#2f313f",
    gradientMiddle: "#1d1f2a",
    gradientEnd: "#0d0e13",
    particleColor: 0xe3e8f5,
    particleAlpha: 0.9,
  },
  {
    gradientStart: "#3f2f35",
    gradientMiddle: "#281d22",
    gradientEnd: "#120d0f",
    particleColor: 0xf0dfe4,
    particleAlpha: 0.9,
  },
  {
    gradientStart: "#373127",
    gradientMiddle: "#231f18",
    gradientEnd: "#12100c",
    particleColor: 0xefe7d5,
    particleAlpha: 0.92,
  },
];

type ControlLegendTokens = {
  simCore: string[];
  classic: string[];
  social: string[];
  flight: string[];
  cosmetics: string[];
};

function sliderIndexToNeighborCap(index: number): number {
  const clampedIndex = Math.min(
    K_SLIDER_MAX_INDEX,
    Math.max(K_SLIDER_MIN_INDEX, index),
  );
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

  let modelKind: SimModelKind = DEFAULT_MODEL_KIND;
  let zEnabled = DEFAULT_Z_ENABLED;
  let bounceX = DEFAULT_BOUNCE_X;
  let bounceY = DEFAULT_BOUNCE_Y;
  let bounceZ = DEFAULT_BOUNCE_Z;
  let birdSize = DEFAULT_BIRD_SIZE;
  let birdOpacity = DEFAULT_BIRD_OPACITY;
  let birdShape: BirdShape = DEFAULT_BIRD_SHAPE;
  let menuOpen = DEFAULT_MENU_OPEN;
  const classicConfig: ClassicModelConfig = { ...DEFAULT_CLASSIC_CONFIG };
  const flock2Social: Flock2SocialConfig = { ...DEFAULT_FLOCK2_SOCIAL };
  const flock2Flight: Flock2FlightConfig = { ...DEFAULT_FLOCK2_FLIGHT };

  const totalBoids = sim.getCount();
  let activeBoids = Math.min(DEFAULT_ACTIVE_BIRDS, totalBoids);
  let birdColor = DEFAULT_PALETTE.particleColor;
  sim.setModelKind(modelKind);
  sim.setFlock2SocialConfig(flock2Social);
  sim.setFlock2FlightConfig(flock2Flight);
  sim.setZMode(zEnabled);
  sim.setZForceScale(0.75);
  sim.setAxisBounce(bounceX, bounceY, bounceZ);
  sim.setClassicConfig(classicConfig);
  sim.setActiveCount(activeBoids);

  const view = await FlockView.create(host, {
    dprCap: 2,
    renderScale: 1,
  });
  let activePaletteIndex = 0;
  const applyPalette = (palette: PaletteSpec): void => {
    setBackgroundGradient(palette);
    const nextTheme: FlockTheme = {
      ...DEFAULT_FLOCK_THEME,
      particleColor: birdColor,
      particleAlpha: birdOpacity,
      particleSize: birdSize,
      particleShape: birdShape,
    };
    view.setTheme(nextTheme);
  };
  applyPalette(DEFAULT_PALETTE);
  const controls = createDebugControls(host, totalBoids);
  const profiler = createLoopProfiler(controls.profileStats);
  profiler.setEnabled(menuOpen);

  const applyAxisBounds = (): void => {
    sim.setAxisBounce(bounceX, bounceY, bounceZ);
  };

  const applyClassicSettings = (): void => {
    sim.setClassicConfig(classicConfig);
  };

  const applyFlock2Settings = (): void => {
    sim.setFlock2SocialConfig(flock2Social);
    sim.setFlock2FlightConfig(flock2Flight);
  };

  const applyActiveModelSettings = (): void => {
    sim.setModelKind(modelKind);
    if (modelKind === "classic") {
      applyClassicSettings();
      return;
    }
    applyFlock2Settings();
  };

  const updateDebugState = (): void => {
    controls.modelSelect.value = modelKind;
    controls.modelValueLabel.textContent = modelKindLabel(modelKind);
    controls.controlHelp.textContent = modelLegendText(
      modelKind,
      controls.legendTokens,
    );
    controls.xBoundsButton.textContent = bounceX ? "X: Bounce" : "X: Wrap";
    controls.yBoundsButton.textContent = bounceY ? "Y: Bounce" : "Y: Wrap";
    controls.zBoundsButton.textContent = bounceZ ? "Z: Bounce" : "Z: Wrap";
    controls.zModeButton.textContent = zEnabled ? "Z Mode: On" : "Z Mode: Off";
    controls.mathModeButton.textContent =
      classicConfig.mathMode === "fast" ? "Math: Fast" : "Math: Accurate";
    controls.kValueLabel.textContent =
      classicConfig.maxNeighborsSampled === 0
        ? "k=inf"
        : `k=${classicConfig.maxNeighborsSampled}`;
    controls.kSlider.value = String(
      neighborCapToSliderIndex(classicConfig.maxNeighborsSampled),
    );
    controls.birdCountValueLabel.textContent = `n=${activeBoids}/${totalBoids}`;
    controls.birdCountSlider.value = String(activeBoids);
    controls.maxForceValueLabel.textContent = `f=${classicConfig.maxForce.toFixed(3)}`;
    controls.maxForceSlider.value = classicConfig.maxForce.toFixed(3);
    const dragNorm = rangeToNormalized(classicConfig.drag, DRAG_UI_MAX);
    controls.dragValueLabel.textContent = `g=${dragNorm.toFixed(3)} (${classicConfig.drag.toFixed(3)})`;
    controls.dragSlider.value = dragNorm.toFixed(3);
    controls.birdOpacityValueLabel.textContent = `op=${birdOpacity.toFixed(2)}`;
    controls.birdOpacitySlider.value = birdOpacity.toFixed(2);
    controls.birdSizeValueLabel.textContent = `size=${birdSize.toFixed(2)}`;
    controls.birdSizeSlider.value = birdSize.toFixed(2);
    controls.birdColorInput.value = rgbNumberToHex(birdColor);
    controls.birdShapeSelect.value = birdShape;
    controls.birdShapeValueLabel.textContent =
      birdShape === "dot"
        ? "shape=Dot"
        : birdShape === "arrow"
          ? "shape=Arrow"
          : "shape=Chevron";
    controls.minDistanceValueLabel.textContent = `d=${classicConfig.minDistance.toFixed(3)}`;
    controls.minDistanceSlider.value = classicConfig.minDistance.toFixed(3);
    controls.hardMinDistanceValueLabel.textContent = `h=${classicConfig.hardMinDistance.toFixed(3)}`;
    controls.hardMinDistanceSlider.value =
      classicConfig.hardMinDistance.toFixed(3);
    controls.jitterValueLabel.textContent = `j=${classicConfig.jitterStrength.toFixed(3)}`;
    controls.jitterSlider.value = classicConfig.jitterStrength.toFixed(3);
    controls.f2NeighborRadiusValueLabel.textContent = `r=${flock2Social.neighborRadius.toFixed(3)}`;
    controls.f2NeighborRadiusSlider.value =
      flock2Social.neighborRadius.toFixed(3);
    controls.f2TopologicalValueLabel.textContent = `k=${flock2Social.topologicalNeighbors}`;
    controls.f2TopologicalSlider.value = String(
      flock2Social.topologicalNeighbors,
    );
    controls.f2FovValueLabel.textContent = `fov=${flock2Social.fieldOfViewDeg.toFixed(0)}`;
    controls.f2FovSlider.value = flock2Social.fieldOfViewDeg.toFixed(0);
    controls.f2AvoidValueLabel.textContent = `av=${flock2Social.avoidWeight.toFixed(3)}`;
    controls.f2AvoidSlider.value = flock2Social.avoidWeight.toFixed(3);
    controls.f2AlignValueLabel.textContent = `al=${flock2Social.alignWeight.toFixed(3)}`;
    controls.f2AlignSlider.value = flock2Social.alignWeight.toFixed(3);
    controls.f2CohesionValueLabel.textContent = `co=${flock2Social.cohesionWeight.toFixed(3)}`;
    controls.f2CohesionSlider.value = flock2Social.cohesionWeight.toFixed(3);
    controls.f2BoundaryWeightValueLabel.textContent = `bw=${flock2Social.boundaryWeight.toFixed(3)}`;
    controls.f2BoundaryWeightSlider.value =
      flock2Social.boundaryWeight.toFixed(3);
    controls.f2BoundaryCountValueLabel.textContent = `bc=${flock2Social.boundaryCount.toFixed(1)}`;
    controls.f2BoundaryCountSlider.value =
      flock2Social.boundaryCount.toFixed(1);
    controls.f2ReactionValueLabel.textContent = `rt=${flock2Flight.reactionTimeMs.toFixed(0)}ms`;
    controls.f2ReactionSlider.value = flock2Flight.reactionTimeMs.toFixed(0);
    controls.f2StabilityValueLabel.textContent = `ds=${flock2Flight.dynamicStability.toFixed(3)}`;
    controls.f2StabilitySlider.value = flock2Flight.dynamicStability.toFixed(3);
    controls.f2MassValueLabel.textContent = `m=${flock2Flight.mass.toFixed(3)}`;
    controls.f2MassSlider.value = flock2Flight.mass.toFixed(3);
    controls.f2WingAreaValueLabel.textContent = `A=${flock2Flight.wingArea.toFixed(4)}`;
    controls.f2WingAreaSlider.value = flock2Flight.wingArea.toFixed(4);
    controls.f2LiftValueLabel.textContent = `cl=${flock2Flight.liftFactor.toFixed(3)}`;
    controls.f2LiftSlider.value = flock2Flight.liftFactor.toFixed(3);
    controls.f2AeroDragValueLabel.textContent = `cd=${flock2Flight.dragFactor.toFixed(3)}`;
    controls.f2AeroDragSlider.value = flock2Flight.dragFactor.toFixed(3);
    controls.f2ThrustValueLabel.textContent = `th=${flock2Flight.thrust.toFixed(3)}`;
    controls.f2ThrustSlider.value = flock2Flight.thrust.toFixed(3);
    controls.f2MinSpeedValueLabel.textContent = `vmin=${flock2Flight.minSpeed.toFixed(2)}`;
    controls.f2MinSpeedSlider.value = flock2Flight.minSpeed.toFixed(2);
    controls.f2MaxSpeedValueLabel.textContent = `vmax=${flock2Flight.maxSpeed.toFixed(2)}`;
    controls.f2MaxSpeedSlider.value = flock2Flight.maxSpeed.toFixed(2);
    controls.f2GravityValueLabel.textContent = `g=${flock2Flight.gravity.toFixed(2)}`;
    controls.f2GravitySlider.value = flock2Flight.gravity.toFixed(2);
    controls.f2AirDensityValueLabel.textContent = `rho=${flock2Flight.airDensity.toFixed(3)}`;
    controls.f2AirDensitySlider.value = flock2Flight.airDensity.toFixed(3);
    controls.menuButton.textContent = menuOpen ? "Menu: On" : "Menu: Off";
    const isClassic = modelKind === "classic";
    const isFlightModel =
      modelKind === "flock2-social-flight" ||
      modelKind === "f2-lite-social-flight";
    controls.classicRows.forEach((row) => {
      row.style.display = isClassic ? "flex" : "none";
    });
    controls.flock2SocialRows.forEach((row) => {
      row.style.display = isClassic ? "none" : "flex";
    });
    controls.flock2FlightRows.forEach((row) => {
      row.style.display = isFlightModel ? "flex" : "none";
    });
    setButtonState(controls.xBoundsButton, bounceX);
    setButtonState(controls.yBoundsButton, bounceY);
    setButtonState(controls.zBoundsButton, bounceZ);
    setButtonState(controls.zModeButton, zEnabled);
    setButtonState(controls.mathModeButton, classicConfig.mathMode === "fast");
    setButtonState(controls.menuButton, menuOpen);
    setButtonState(controls.randomizeButton, false);
    controls.menuBody.style.display = menuOpen ? "flex" : "none";
    controls.controlHelp.style.display = menuOpen ? "block" : "none";
    controls.profileStats.style.display = menuOpen ? "block" : "none";
  };
  updateDebugState();

  controls.modelSelect.addEventListener("change", () => {
    const nextKind = controls.modelSelect.value as SimModelKind;
    modelKind = nextKind;
    applyActiveModelSettings();
    updateDebugState();
  });

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
    classicConfig.mathMode =
      classicConfig.mathMode === "fast" ? "accurate" : "fast";
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.kSlider.addEventListener("input", () => {
    const sliderIndex = Number.parseInt(controls.kSlider.value, 10);
    classicConfig.maxNeighborsSampled = sliderIndexToNeighborCap(sliderIndex);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.birdCountSlider.addEventListener("input", () => {
    activeBoids = Number.parseInt(controls.birdCountSlider.value, 10);
    sim.setActiveCount(activeBoids);
    updateDebugState();
  });

  controls.maxForceSlider.addEventListener("input", () => {
    classicConfig.maxForce = Number.parseFloat(controls.maxForceSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.dragSlider.addEventListener("input", () => {
    const dragNorm = Number.parseFloat(controls.dragSlider.value);
    classicConfig.drag = normalizedToRange(dragNorm, DRAG_UI_MAX);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.birdSizeSlider.addEventListener("input", () => {
    birdSize = Number.parseFloat(controls.birdSizeSlider.value);
    applyPalette(RANDOM_PALETTES[activePaletteIndex]);
    updateDebugState();
  });

  controls.birdOpacitySlider.addEventListener("input", () => {
    birdOpacity = Number.parseFloat(controls.birdOpacitySlider.value);
    applyPalette(RANDOM_PALETTES[activePaletteIndex]);
    updateDebugState();
  });

  controls.birdColorInput.addEventListener("input", () => {
    birdColor = parseHexToRgbNumber(controls.birdColorInput.value);
    applyPalette(RANDOM_PALETTES[activePaletteIndex]);
    updateDebugState();
  });

  controls.birdShapeSelect.addEventListener("change", () => {
    birdShape = controls.birdShapeSelect.value as BirdShape;
    applyPalette(RANDOM_PALETTES[activePaletteIndex]);
    updateDebugState();
  });

  controls.minDistanceSlider.addEventListener("input", () => {
    classicConfig.minDistance = Number.parseFloat(controls.minDistanceSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.hardMinDistanceSlider.addEventListener("input", () => {
    classicConfig.hardMinDistance = Number.parseFloat(
      controls.hardMinDistanceSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.jitterSlider.addEventListener("input", () => {
    classicConfig.jitterStrength = Number.parseFloat(controls.jitterSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2NeighborRadiusSlider.addEventListener("input", () => {
    flock2Social.neighborRadius = Number.parseFloat(
      controls.f2NeighborRadiusSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2TopologicalSlider.addEventListener("input", () => {
    flock2Social.topologicalNeighbors = Number.parseInt(
      controls.f2TopologicalSlider.value,
      10,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2FovSlider.addEventListener("input", () => {
    flock2Social.fieldOfViewDeg = Number.parseFloat(controls.f2FovSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2AvoidSlider.addEventListener("input", () => {
    flock2Social.avoidWeight = Number.parseFloat(controls.f2AvoidSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2AlignSlider.addEventListener("input", () => {
    flock2Social.alignWeight = Number.parseFloat(controls.f2AlignSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2CohesionSlider.addEventListener("input", () => {
    flock2Social.cohesionWeight = Number.parseFloat(
      controls.f2CohesionSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2BoundaryWeightSlider.addEventListener("input", () => {
    flock2Social.boundaryWeight = Number.parseFloat(
      controls.f2BoundaryWeightSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2BoundaryCountSlider.addEventListener("input", () => {
    flock2Social.boundaryCount = Number.parseFloat(
      controls.f2BoundaryCountSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2ReactionSlider.addEventListener("input", () => {
    flock2Flight.reactionTimeMs = Number.parseFloat(
      controls.f2ReactionSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2StabilitySlider.addEventListener("input", () => {
    flock2Flight.dynamicStability = Number.parseFloat(
      controls.f2StabilitySlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2MassSlider.addEventListener("input", () => {
    flock2Flight.mass = Number.parseFloat(controls.f2MassSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2WingAreaSlider.addEventListener("input", () => {
    flock2Flight.wingArea = Number.parseFloat(controls.f2WingAreaSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2LiftSlider.addEventListener("input", () => {
    flock2Flight.liftFactor = Number.parseFloat(controls.f2LiftSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2AeroDragSlider.addEventListener("input", () => {
    flock2Flight.dragFactor = Number.parseFloat(
      controls.f2AeroDragSlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2ThrustSlider.addEventListener("input", () => {
    flock2Flight.thrust = Number.parseFloat(controls.f2ThrustSlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2MinSpeedSlider.addEventListener("input", () => {
    flock2Flight.minSpeed = Number.parseFloat(controls.f2MinSpeedSlider.value);
    if (flock2Flight.minSpeed > flock2Flight.maxSpeed) {
      flock2Flight.maxSpeed = flock2Flight.minSpeed;
    }
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2MaxSpeedSlider.addEventListener("input", () => {
    flock2Flight.maxSpeed = Number.parseFloat(controls.f2MaxSpeedSlider.value);
    if (flock2Flight.maxSpeed < flock2Flight.minSpeed) {
      flock2Flight.minSpeed = flock2Flight.maxSpeed;
    }
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2GravitySlider.addEventListener("input", () => {
    flock2Flight.gravity = Number.parseFloat(controls.f2GravitySlider.value);
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.f2AirDensitySlider.addEventListener("input", () => {
    flock2Flight.airDensity = Number.parseFloat(
      controls.f2AirDensitySlider.value,
    );
    applyActiveModelSettings();
    updateDebugState();
  });

  controls.menuButton.addEventListener("click", () => {
    menuOpen = !menuOpen;
    profiler.setEnabled(menuOpen);
    updateDebugState();
  });

  controls.randomizeButton.addEventListener("click", () => {
    const nextPaletteIndex = pickRandomPaletteIndex(
      activePaletteIndex,
      RANDOM_PALETTES.length,
    );
    activePaletteIndex = nextPaletteIndex;
    birdColor = randomBirdColor();
    applyPalette(RANDOM_PALETTES[nextPaletteIndex]);
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
  applyActiveModelSettings();

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
    view.render(
      positions,
      zEnabled ? sim.getDepth() : undefined,
      1,
      activeBoids,
      sim.getHeading(),
    );
    const renderMs = performance.now() - renderStartMs;
    const frameMs = performance.now() - frameStartMs;

    if (menuOpen) {
      profiler.record(now, {
        frameMs,
        simMs,
        renderMs,
        simSteps,
        neighborsVisited: sim.getNeighborsVisitedLastStep(),
        renderedBoids: activeBoids,
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

function createDebugControls(
  host: HTMLElement,
  maxBirds: number,
): {
  menuBody: HTMLDivElement;
  legendTokens: ControlLegendTokens;
  modelSelect: HTMLSelectElement;
  modelValueLabel: HTMLSpanElement;
  classicRows: HTMLDivElement[];
  flock2SocialRows: HTMLDivElement[];
  flock2FlightRows: HTMLDivElement[];
  xBoundsButton: HTMLButtonElement;
  yBoundsButton: HTMLButtonElement;
  zBoundsButton: HTMLButtonElement;
  zModeButton: HTMLButtonElement;
  mathModeButton: HTMLButtonElement;
  menuButton: HTMLButtonElement;
  randomizeButton: HTMLButtonElement;
  birdColorInput: HTMLInputElement;
  birdOpacitySlider: HTMLInputElement;
  birdOpacityValueLabel: HTMLSpanElement;
  birdShapeSelect: HTMLSelectElement;
  birdShapeValueLabel: HTMLSpanElement;
  kSlider: HTMLInputElement;
  kValueLabel: HTMLSpanElement;
  birdCountSlider: HTMLInputElement;
  birdCountValueLabel: HTMLSpanElement;
  maxForceSlider: HTMLInputElement;
  maxForceValueLabel: HTMLSpanElement;
  dragSlider: HTMLInputElement;
  dragValueLabel: HTMLSpanElement;
  birdSizeSlider: HTMLInputElement;
  birdSizeValueLabel: HTMLSpanElement;
  minDistanceSlider: HTMLInputElement;
  minDistanceValueLabel: HTMLSpanElement;
  hardMinDistanceSlider: HTMLInputElement;
  hardMinDistanceValueLabel: HTMLSpanElement;
  jitterSlider: HTMLInputElement;
  jitterValueLabel: HTMLSpanElement;
  f2NeighborRadiusSlider: HTMLInputElement;
  f2NeighborRadiusValueLabel: HTMLSpanElement;
  f2TopologicalSlider: HTMLInputElement;
  f2TopologicalValueLabel: HTMLSpanElement;
  f2FovSlider: HTMLInputElement;
  f2FovValueLabel: HTMLSpanElement;
  f2AvoidSlider: HTMLInputElement;
  f2AvoidValueLabel: HTMLSpanElement;
  f2AlignSlider: HTMLInputElement;
  f2AlignValueLabel: HTMLSpanElement;
  f2CohesionSlider: HTMLInputElement;
  f2CohesionValueLabel: HTMLSpanElement;
  f2BoundaryWeightSlider: HTMLInputElement;
  f2BoundaryWeightValueLabel: HTMLSpanElement;
  f2BoundaryCountSlider: HTMLInputElement;
  f2BoundaryCountValueLabel: HTMLSpanElement;
  f2ReactionSlider: HTMLInputElement;
  f2ReactionValueLabel: HTMLSpanElement;
  f2StabilitySlider: HTMLInputElement;
  f2StabilityValueLabel: HTMLSpanElement;
  f2MassSlider: HTMLInputElement;
  f2MassValueLabel: HTMLSpanElement;
  f2WingAreaSlider: HTMLInputElement;
  f2WingAreaValueLabel: HTMLSpanElement;
  f2LiftSlider: HTMLInputElement;
  f2LiftValueLabel: HTMLSpanElement;
  f2AeroDragSlider: HTMLInputElement;
  f2AeroDragValueLabel: HTMLSpanElement;
  f2ThrustSlider: HTMLInputElement;
  f2ThrustValueLabel: HTMLSpanElement;
  f2MinSpeedSlider: HTMLInputElement;
  f2MinSpeedValueLabel: HTMLSpanElement;
  f2MaxSpeedSlider: HTMLInputElement;
  f2MaxSpeedValueLabel: HTMLSpanElement;
  f2GravitySlider: HTMLInputElement;
  f2GravityValueLabel: HTMLSpanElement;
  f2AirDensitySlider: HTMLInputElement;
  f2AirDensityValueLabel: HTMLSpanElement;
  controlHelp: HTMLDivElement;
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

  const menuRow = document.createElement("div");
  menuRow.style.display = "flex";
  menuRow.style.gap = "4px";
  menuRow.style.flexWrap = "wrap";

  const menuBody = document.createElement("div");
  menuBody.style.display = "flex";
  menuBody.style.flexDirection = "column";
  menuBody.style.gap = "4px";

  const createSection = (label: string): HTMLDivElement => {
    const section = document.createElement("div");
    section.style.display = "flex";
    section.style.flexDirection = "column";
    section.style.gap = "3px";
    section.style.padding = "4px";
    section.style.border = "1px solid rgba(187, 208, 234, 0.25)";
    section.style.borderRadius = "4px";
    section.style.background = "rgba(2, 5, 10, 0.5)";

    const title = document.createElement("div");
    title.textContent = label;
    title.style.color = "#d7e9ff";
    title.style.font =
      '600 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    title.style.textTransform = "uppercase";
    section.appendChild(title);
    return section;
  };

  const modelRow = document.createElement("div");
  modelRow.style.display = "flex";
  modelRow.style.alignItems = "center";
  modelRow.style.gap = "4px";

  const modelSelect = document.createElement("select");
  modelSelect.style.height = "20px";
  modelSelect.style.border = "1px solid rgba(187, 208, 234, 0.65)";
  modelSelect.style.borderRadius = "4px";
  modelSelect.style.background = "rgba(6, 10, 18, 0.9)";
  modelSelect.style.color = "#e6f0ff";
  modelSelect.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  modelSelect.style.padding = "0 6px";
  modelSelect.style.cursor = "pointer";
  modelSelect.title = "Select active simulation model.";

  const modelOptions: Array<{ value: SimModelKind; label: string }> = [
    { value: "classic", label: "Classic" },
    { value: "flock2-social", label: "F2 Social" },
    { value: "flock2-social-flight", label: "F2 Social+Flight" },
    { value: "f2-lite-social", label: "F2 Lite Social" },
    { value: "f2-lite-social-flight", label: "F2 Lite Social+Flight" },
  ];
  modelOptions.forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    modelSelect.appendChild(node);
  });

  const modelValueLabel = document.createElement("span");
  modelValueLabel.textContent = "Flockround Classic";
  modelValueLabel.style.display = "inline-flex";
  modelValueLabel.style.alignItems = "center";
  modelValueLabel.style.height = "20px";
  modelValueLabel.style.padding = "0 4px";
  modelValueLabel.style.color = "#e6f0ff";
  modelValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  modelRow.append(modelSelect, modelValueLabel);

  const sliderStack = document.createElement("div");
  sliderStack.style.display = "flex";
  sliderStack.style.flexDirection = "column";
  sliderStack.style.gap = "3px";
  const classicRows: HTMLDivElement[] = [];
  const flock2SocialRows: HTMLDivElement[] = [];
  const flock2FlightRows: HTMLDivElement[] = [];

  const xBoundsButton = createDebugButton("X: Wrap");
  xBoundsButton.title =
    "X-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const yBoundsButton = createDebugButton("Y: Wrap");
  yBoundsButton.title =
    "Y-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const zBoundsButton = createDebugButton("Z: Bounce");
  zBoundsButton.title =
    "Z-axis boundary mode: Wrap teleports at edges, Bounce reflects velocity.";
  const zModeButton = createDebugButton("Z Mode: On");
  zModeButton.title = "Enable or disable depth simulation (3D movement).";
  const mathModeButton = createDebugButton(
    DEFAULT_MATH_MODE === "fast" ? "Math: Fast" : "Math: Accurate",
  );
  mathModeButton.title =
    "Math path for vector ops: Accurate favors precision, Fast favors speed.";
  const menuButton = createDebugButton("Menu: On");
  menuButton.title = "Show or hide the simulation controls menu.";
  const randomizeButton = createDebugButton("Randomize");
  randomizeButton.title = "Randomize palette background and bird color.";
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
  dragValueLabel.textContent = `g=${rangeToNormalized(DEFAULT_DRAG, DRAG_UI_MAX).toFixed(3)} (${DEFAULT_DRAG.toFixed(3)})`;
  dragValueLabel.style.display = "inline-flex";
  dragValueLabel.style.alignItems = "center";
  dragValueLabel.style.height = "20px";
  dragValueLabel.style.padding = "0 4px";
  dragValueLabel.style.color = "#e6f0ff";
  dragValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const birdSizeSlider = document.createElement("input");
  birdSizeSlider.type = "range";
  birdSizeSlider.min = "0.50";
  birdSizeSlider.max = "8.00";
  birdSizeSlider.step = "0.05";
  birdSizeSlider.value = DEFAULT_BIRD_SIZE.toFixed(2);
  birdSizeSlider.style.width = "90px";
  birdSizeSlider.style.height = "20px";
  birdSizeSlider.style.margin = "0";
  birdSizeSlider.style.cursor = "pointer";
  birdSizeSlider.title = "size: rendered bird size in pixels.";

  const birdSizeValueLabel = document.createElement("span");
  birdSizeValueLabel.textContent = `size=${DEFAULT_BIRD_SIZE.toFixed(2)}`;
  birdSizeValueLabel.style.display = "inline-flex";
  birdSizeValueLabel.style.alignItems = "center";
  birdSizeValueLabel.style.height = "20px";
  birdSizeValueLabel.style.padding = "0 4px";
  birdSizeValueLabel.style.color = "#e6f0ff";
  birdSizeValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const birdOpacitySlider = document.createElement("input");
  birdOpacitySlider.type = "range";
  birdOpacitySlider.min = "0.05";
  birdOpacitySlider.max = "1.00";
  birdOpacitySlider.step = "0.01";
  birdOpacitySlider.value = DEFAULT_BIRD_OPACITY.toFixed(2);
  birdOpacitySlider.style.width = "90px";
  birdOpacitySlider.style.height = "20px";
  birdOpacitySlider.style.margin = "0";
  birdOpacitySlider.style.cursor = "pointer";
  birdOpacitySlider.title = "op: bird opacity.";

  const birdOpacityValueLabel = document.createElement("span");
  birdOpacityValueLabel.textContent = `op=${DEFAULT_BIRD_OPACITY.toFixed(2)}`;
  birdOpacityValueLabel.style.display = "inline-flex";
  birdOpacityValueLabel.style.alignItems = "center";
  birdOpacityValueLabel.style.height = "20px";
  birdOpacityValueLabel.style.padding = "0 4px";
  birdOpacityValueLabel.style.color = "#e6f0ff";
  birdOpacityValueLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  const birdColorInput = document.createElement("input");
  birdColorInput.type = "color";
  birdColorInput.value = rgbNumberToHex(DEFAULT_PALETTE.particleColor);
  birdColorInput.style.width = "90px";
  birdColorInput.style.height = "20px";
  birdColorInput.style.padding = "0";
  birdColorInput.style.border = "1px solid rgba(187, 208, 234, 0.65)";
  birdColorInput.style.borderRadius = "4px";
  birdColorInput.style.background = "rgba(6, 10, 18, 0.9)";
  birdColorInput.style.cursor = "pointer";
  birdColorInput.title = "Bird color.";

  const birdShapeSelect = document.createElement("select");
  birdShapeSelect.style.height = "20px";
  birdShapeSelect.style.border = "1px solid rgba(187, 208, 234, 0.65)";
  birdShapeSelect.style.borderRadius = "4px";
  birdShapeSelect.style.background = "rgba(6, 10, 18, 0.9)";
  birdShapeSelect.style.color = "#e6f0ff";
  birdShapeSelect.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  birdShapeSelect.style.padding = "0 6px";
  birdShapeSelect.style.cursor = "pointer";
  birdShapeSelect.title = "Bird sprite shape.";
  [
    { value: "dot", label: "Dot" },
    { value: "arrow", label: "Arrow" },
    { value: "chevron", label: "Chevron" },
  ].forEach((option) => {
    const node = document.createElement("option");
    node.value = option.value;
    node.textContent = option.label;
    birdShapeSelect.appendChild(node);
  });

  const birdShapeValueLabel = document.createElement("span");
  birdShapeValueLabel.textContent = "shape=Dot";
  birdShapeValueLabel.style.display = "inline-flex";
  birdShapeValueLabel.style.alignItems = "center";
  birdShapeValueLabel.style.height = "20px";
  birdShapeValueLabel.style.padding = "0 4px";
  birdShapeValueLabel.style.color = "#e6f0ff";
  birdShapeValueLabel.style.font =
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
  minDistanceSlider.title =
    "d: soft minimum separation (boids force shaping) in world units.";

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
  controlHelp.style.whiteSpace = "pre-wrap";
  controlHelp.style.overflowWrap = "anywhere";
  controlHelp.textContent = "";

  const buttons = [
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    menuButton,
    randomizeButton,
  ];
  for (const button of buttons) {
    button.style.height = "20px";
    button.style.padding = "0 6px";
    button.style.border = "1px solid rgba(187, 208, 234, 0.65)";
    button.style.borderRadius = "4px";
    button.style.background = "rgba(6, 10, 18, 0.9)";
    button.style.color = "#e6f0ff";
    button.style.font =
      '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
    button.style.cursor = "pointer";
    button.style.backdropFilter = "blur(1px)";
  }
  menuRow.appendChild(menuButton);

  const createSliderRow = (
    slider: HTMLElement,
    valueLabel: HTMLSpanElement,
  ): HTMLDivElement => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.append(slider, valueLabel);
    return row;
  };

  const createF2Slider = (
    min: string,
    max: string,
    step: string,
    value: string,
    title: string,
    label: string,
  ): {
    slider: HTMLInputElement;
    valueLabel: HTMLSpanElement;
    row: HTMLDivElement;
  } => {
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = min;
    slider.max = max;
    slider.step = step;
    slider.value = value;
    slider.style.width = "90px";
    slider.style.height = "20px";
    slider.style.margin = "0";
    slider.style.cursor = "pointer";
    slider.title = title;

    const valueLabel = document.createElement("span");
    valueLabel.textContent = label;
    valueLabel.style.display = "inline-flex";
    valueLabel.style.alignItems = "center";
    valueLabel.style.height = "20px";
    valueLabel.style.padding = "0 4px";
    valueLabel.style.color = "#e6f0ff";
    valueLabel.style.font =
      '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

    const row = createSliderRow(slider, valueLabel);
    return { slider, valueLabel, row };
  };

  const f2NeighborRadius = createF2Slider(
    "0.010",
    "0.500",
    "0.001",
    "0.100",
    "F2 neighbor radius.",
    "r=0.100",
  );
  const f2Topological = createF2Slider(
    "1",
    "32",
    "1",
    "7",
    "F2 topological neighbors.",
    "k=7",
  );
  const f2Fov = createF2Slider(
    "30",
    "360",
    "1",
    "290",
    "F2 field of view in degrees.",
    "fov=290",
  );
  const f2Avoid = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.020",
    "F2 avoidance strength.",
    "av=0.020",
  );
  const f2Align = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.600",
    "F2 alignment strength.",
    "al=0.600",
  );
  const f2Cohesion = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.004",
    "F2 cohesion strength.",
    "co=0.004",
  );
  const f2BoundaryWeight = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.100",
    "F2 boundary strength.",
    "bw=0.100",
  );
  const f2BoundaryCount = createF2Slider(
    "0.0",
    "256.0",
    "0.5",
    "20.0",
    "F2 boundary count term.",
    "bc=20.0",
  );
  const f2Reaction = createF2Slider(
    "25",
    "2000",
    "1",
    "250",
    "F2 reaction speed in ms.",
    "rt=250ms",
  );
  const f2Stability = createF2Slider(
    "0.000",
    "1.000",
    "0.001",
    "0.700",
    "F2 dynamic stability.",
    "ds=0.700",
  );
  const f2Mass = createF2Slider(
    "0.010",
    "5.000",
    "0.001",
    "0.080",
    "Mass (kg).",
    "m=0.080",
  );
  const f2WingArea = createF2Slider(
    "0.0010",
    "1.0000",
    "0.0001",
    "0.0224",
    "Wing area.",
    "A=0.0224",
  );
  const f2Lift = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.571",
    "Lift coefficient factor.",
    "cl=0.571",
  );
  const f2AeroDrag = createF2Slider(
    "0.000",
    "2.000",
    "0.001",
    "0.173",
    "Drag coefficient factor.",
    "cd=0.173",
  );
  const f2Thrust = createF2Slider(
    "0.000",
    "20.000",
    "0.001",
    "0.237",
    "Thrust scalar.",
    "th=0.237",
  );
  const f2MinSpeed = createF2Slider(
    "0.00",
    "200.00",
    "0.01",
    "5.00",
    "Minimum speed.",
    "vmin=5.00",
  );
  const f2MaxSpeed = createF2Slider(
    "0.00",
    "250.00",
    "0.01",
    "18.00",
    "Maximum speed.",
    "vmax=18.00",
  );
  const f2Gravity = createF2Slider(
    "0.00",
    "30.00",
    "0.01",
    "9.80",
    "Gravity.",
    "g=9.80",
  );
  const f2AirDensity = createF2Slider(
    "0.100",
    "3.000",
    "0.001",
    "1.225",
    "Air density.",
    "rho=1.225",
  );

  const kRow = createSliderRow(kSlider, kValueLabel);
  const birdCountRow = createSliderRow(birdCountSlider, birdCountValueLabel);
  const maxForceRow = createSliderRow(maxForceSlider, maxForceValueLabel);
  const dragRow = createSliderRow(dragSlider, dragValueLabel);
  const birdOpacityRow = createSliderRow(
    birdOpacitySlider,
    birdOpacityValueLabel,
  );
  const birdSizeRow = createSliderRow(birdSizeSlider, birdSizeValueLabel);
  const birdShapeRow = createSliderRow(birdShapeSelect, birdShapeValueLabel);
  const birdColorLabel = document.createElement("span");
  birdColorLabel.textContent = "color";
  birdColorLabel.style.display = "inline-flex";
  birdColorLabel.style.alignItems = "center";
  birdColorLabel.style.height = "20px";
  birdColorLabel.style.padding = "0 4px";
  birdColorLabel.style.color = "#e6f0ff";
  birdColorLabel.style.font =
    '500 10px/1 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  const birdColorRow = createSliderRow(birdColorInput, birdColorLabel);
  const randomizeRow = document.createElement("div");
  randomizeRow.style.display = "flex";
  randomizeRow.style.alignItems = "center";
  randomizeRow.style.gap = "4px";
  randomizeRow.append(randomizeButton);
  const minDistanceRow = createSliderRow(
    minDistanceSlider,
    minDistanceValueLabel,
  );
  const hardMinDistanceRow = createSliderRow(
    hardMinDistanceSlider,
    hardMinDistanceValueLabel,
  );
  const jitterRow = createSliderRow(jitterSlider, jitterValueLabel);
  const legendTokens: ControlLegendTokens = {
    simCore: ["model", "math", legendTokenFromLabel(birdCountValueLabel.textContent)],
    classic: [
      legendTokenFromLabel(kValueLabel.textContent),
      legendTokenFromLabel(maxForceValueLabel.textContent),
      legendTokenFromLabel(dragValueLabel.textContent),
      legendTokenFromLabel(minDistanceValueLabel.textContent),
      legendTokenFromLabel(hardMinDistanceValueLabel.textContent),
      legendTokenFromLabel(jitterValueLabel.textContent),
    ].filter((token) => token.length > 0),
    social: [
      legendTokenFromLabel(f2NeighborRadius.valueLabel.textContent),
      legendTokenFromLabel(f2Topological.valueLabel.textContent),
      legendTokenFromLabel(f2Fov.valueLabel.textContent),
      legendTokenFromLabel(f2Avoid.valueLabel.textContent),
      legendTokenFromLabel(f2Align.valueLabel.textContent),
      legendTokenFromLabel(f2Cohesion.valueLabel.textContent),
      legendTokenFromLabel(f2BoundaryWeight.valueLabel.textContent),
      legendTokenFromLabel(f2BoundaryCount.valueLabel.textContent),
    ].filter((token) => token.length > 0),
    flight: [
      legendTokenFromLabel(f2Reaction.valueLabel.textContent),
      legendTokenFromLabel(f2Stability.valueLabel.textContent),
      legendTokenFromLabel(f2Mass.valueLabel.textContent),
      legendTokenFromLabel(f2WingArea.valueLabel.textContent),
      legendTokenFromLabel(f2Lift.valueLabel.textContent),
      legendTokenFromLabel(f2AeroDrag.valueLabel.textContent),
      legendTokenFromLabel(f2Thrust.valueLabel.textContent),
      legendTokenFromLabel(f2MinSpeed.valueLabel.textContent),
      legendTokenFromLabel(f2MaxSpeed.valueLabel.textContent),
      legendTokenFromLabel(f2Gravity.valueLabel.textContent),
      legendTokenFromLabel(f2AirDensity.valueLabel.textContent),
    ].filter((token) => token.length > 0),
    cosmetics: [
      legendTokenFromLabel(birdColorLabel.textContent),
      legendTokenFromLabel(birdOpacityValueLabel.textContent),
      legendTokenFromLabel(birdSizeValueLabel.textContent),
      legendTokenFromLabel(birdShapeValueLabel.textContent),
      "randomize",
    ].filter((token) => token.length > 0),
  };
  controlHelp.textContent = modelLegendText(DEFAULT_MODEL_KIND, legendTokens);

  classicRows.push(
    kRow,
    maxForceRow,
    dragRow,
    minDistanceRow,
    hardMinDistanceRow,
    jitterRow,
  );
  flock2SocialRows.push(
    f2NeighborRadius.row,
    f2Topological.row,
    f2Fov.row,
    f2Avoid.row,
    f2Align.row,
    f2Cohesion.row,
    f2BoundaryWeight.row,
    f2BoundaryCount.row,
  );
  flock2FlightRows.push(
    f2Reaction.row,
    f2Stability.row,
    f2Mass.row,
    f2WingArea.row,
    f2Lift.row,
    f2AeroDrag.row,
    f2Thrust.row,
    f2MinSpeed.row,
    f2MaxSpeed.row,
    f2Gravity.row,
    f2AirDensity.row,
  );

  sliderStack.append(
    kRow,
    birdCountRow,
    maxForceRow,
    dragRow,
    minDistanceRow,
    hardMinDistanceRow,
    jitterRow,
    f2NeighborRadius.row,
    f2Topological.row,
    f2Fov.row,
    f2Avoid.row,
    f2Align.row,
    f2Cohesion.row,
    f2BoundaryWeight.row,
    f2BoundaryCount.row,
    f2Reaction.row,
    f2Stability.row,
    f2Mass.row,
    f2WingArea.row,
    f2Lift.row,
    f2AeroDrag.row,
    f2Thrust.row,
    f2MinSpeed.row,
    f2MaxSpeed.row,
    f2Gravity.row,
    f2AirDensity.row,
  );

  const windowSection = createSection("Window");
  const windowButtonsRow = document.createElement("div");
  windowButtonsRow.style.display = "flex";
  windowButtonsRow.style.gap = "4px";
  windowButtonsRow.style.flexWrap = "wrap";
  windowButtonsRow.append(xBoundsButton, yBoundsButton, zBoundsButton, zModeButton);
  windowSection.append(windowButtonsRow);

  const simSection = createSection("Sim");
  const simButtonsRow = document.createElement("div");
  simButtonsRow.style.display = "flex";
  simButtonsRow.style.gap = "4px";
  simButtonsRow.style.flexWrap = "wrap";
  simButtonsRow.append(mathModeButton);
  simSection.append(modelRow, simButtonsRow, sliderStack);

  const cosmeticsSection = createSection("Cosmetics");
  cosmeticsSection.append(
    birdColorRow,
    birdOpacityRow,
    birdSizeRow,
    birdShapeRow,
    randomizeRow,
  );

  menuBody.append(windowSection, simSection, cosmeticsSection, controlHelp, profileStats);
  panel.append(menuRow, menuBody);
  host.appendChild(panel);

  return {
    menuBody,
    legendTokens,
    modelSelect,
    modelValueLabel,
    classicRows,
    flock2SocialRows,
    flock2FlightRows,
    xBoundsButton,
    yBoundsButton,
    zBoundsButton,
    zModeButton,
    mathModeButton,
    menuButton,
    randomizeButton,
    birdColorInput,
    birdOpacitySlider,
    birdOpacityValueLabel,
    birdShapeSelect,
    birdShapeValueLabel,
    kSlider,
    kValueLabel,
    birdCountSlider,
    birdCountValueLabel,
    maxForceSlider,
    maxForceValueLabel,
    dragSlider,
    dragValueLabel,
    birdSizeSlider,
    birdSizeValueLabel,
    minDistanceSlider,
    minDistanceValueLabel,
    hardMinDistanceSlider,
    hardMinDistanceValueLabel,
    jitterSlider,
    jitterValueLabel,
    f2NeighborRadiusSlider: f2NeighborRadius.slider,
    f2NeighborRadiusValueLabel: f2NeighborRadius.valueLabel,
    f2TopologicalSlider: f2Topological.slider,
    f2TopologicalValueLabel: f2Topological.valueLabel,
    f2FovSlider: f2Fov.slider,
    f2FovValueLabel: f2Fov.valueLabel,
    f2AvoidSlider: f2Avoid.slider,
    f2AvoidValueLabel: f2Avoid.valueLabel,
    f2AlignSlider: f2Align.slider,
    f2AlignValueLabel: f2Align.valueLabel,
    f2CohesionSlider: f2Cohesion.slider,
    f2CohesionValueLabel: f2Cohesion.valueLabel,
    f2BoundaryWeightSlider: f2BoundaryWeight.slider,
    f2BoundaryWeightValueLabel: f2BoundaryWeight.valueLabel,
    f2BoundaryCountSlider: f2BoundaryCount.slider,
    f2BoundaryCountValueLabel: f2BoundaryCount.valueLabel,
    f2ReactionSlider: f2Reaction.slider,
    f2ReactionValueLabel: f2Reaction.valueLabel,
    f2StabilitySlider: f2Stability.slider,
    f2StabilityValueLabel: f2Stability.valueLabel,
    f2MassSlider: f2Mass.slider,
    f2MassValueLabel: f2Mass.valueLabel,
    f2WingAreaSlider: f2WingArea.slider,
    f2WingAreaValueLabel: f2WingArea.valueLabel,
    f2LiftSlider: f2Lift.slider,
    f2LiftValueLabel: f2Lift.valueLabel,
    f2AeroDragSlider: f2AeroDrag.slider,
    f2AeroDragValueLabel: f2AeroDrag.valueLabel,
    f2ThrustSlider: f2Thrust.slider,
    f2ThrustValueLabel: f2Thrust.valueLabel,
    f2MinSpeedSlider: f2MinSpeed.slider,
    f2MinSpeedValueLabel: f2MinSpeed.valueLabel,
    f2MaxSpeedSlider: f2MaxSpeed.slider,
    f2MaxSpeedValueLabel: f2MaxSpeed.valueLabel,
    f2GravitySlider: f2Gravity.slider,
    f2GravityValueLabel: f2Gravity.valueLabel,
    f2AirDensitySlider: f2AirDensity.slider,
    f2AirDensityValueLabel: f2AirDensity.valueLabel,
    controlHelp,
    profileStats,
  };
}

function modelKindLabel(modelKind: SimModelKind): string {
  switch (modelKind) {
    case "classic":
      return "Flockround Classic";
    case "flock2-social":
      return "Flock2 Social";
    case "flock2-social-flight":
      return "Flock2 Social+Flight";
    case "f2-lite-social":
      return "F2 Lite Social";
    case "f2-lite-social-flight":
      return "F2 Lite Social+Flight";
  }
}

function modelLegendText(
  modelKind: SimModelKind,
  legendTokens: ControlLegendTokens,
): string {
  const formatLegendItems = (
    tokens: string[],
    descriptions: Record<string, string>,
  ): string[] =>
    tokens.map((token) => {
      const description = descriptions[token];
      return description ? `${token}=${description}` : token;
    });
  const buildLegendBlock = (
    title: string,
    items: string[],
  ): string[] => [title, ...items.map((item) => `  ${item}`)];

  const simDescriptions: Record<string, string> = {
    model: "sim model",
    math: "precision/speed",
    n: "bird count",
  };
  const cosmeticsDescriptions: Record<string, string> = {
    color: "tint",
    op: "opacity",
    size: "bird size",
    shape: "sprite",
    randomize: "new palette+color",
  };
  const classicDescriptions: Record<string, string> = {
    k: "neighbor cap",
    f: "max steer",
    g: "drag damping",
    d: "soft min dist",
    h: "hard min dist",
    j: "jitter",
  };
  const socialDescriptions: Record<string, string> = {
    r: "neighbor radius",
    k: "neighbor count",
    fov: "view angle",
    av: "avoid weight",
    al: "align weight",
    co: "cohesion weight",
    bw: "boundary weight",
    bc: "boundary crowd",
  };
  const flightDescriptions: Record<string, string> = {
    rt: "reaction ms",
    ds: "stability",
    m: "mass",
    A: "wing area",
    cl: "lift",
    cd: "drag",
    th: "thrust",
    vmin: "min speed",
    vmax: "max speed",
    g: "gravity",
    rho: "air density",
  };

  const baseLines = [
    `Model: ${modelKindLabel(modelKind)}`,
    "Window: X/Y/Z=wrap or bounce | zmode=depth motion",
    ...buildLegendBlock(
      "Sim:",
      formatLegendItems(legendTokens.simCore, simDescriptions),
    ),
    ...buildLegendBlock(
      "Cosmetics:",
      formatLegendItems(legendTokens.cosmetics, cosmeticsDescriptions),
    ),
  ];
  const classicLines = buildLegendBlock(
    "Classic sliders:",
    formatLegendItems(legendTokens.classic, classicDescriptions),
  );
  const socialLines = buildLegendBlock(
    "Social sliders:",
    formatLegendItems(legendTokens.social, socialDescriptions),
  );
  const flightLines = buildLegendBlock(
    "Flight sliders:",
    formatLegendItems(legendTokens.flight, flightDescriptions),
  );

  if (modelKind === "classic") {
    return [...classicLines, ...baseLines].join("\n");
  }
  if (modelKind === "flock2-social" || modelKind === "f2-lite-social") {
    return [...socialLines, ...baseLines].join("\n");
  }
  return [...socialLines, ...flightLines, ...baseLines].join("\n");
}

function legendTokenFromLabel(labelText: string | null): string {
  if (!labelText) {
    return "";
  }
  const trimmed = labelText.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const equalsIndex = trimmed.indexOf("=");
  if (equalsIndex > 0) {
    return trimmed.slice(0, equalsIndex).trim();
  }
  return trimmed.toLowerCase();
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
  button.style.background = active
    ? "rgba(21, 55, 90, 0.95)"
    : "rgba(6, 10, 18, 0.9)";
  button.style.color = active ? "#ffffff" : "#e6f0ff";
}

function setBackgroundGradient(palette: PaletteSpec): void {
  const root = document.documentElement;
  root.style.setProperty("--bg-stop-0", palette.gradientStart);
  root.style.setProperty("--bg-stop-1", palette.gradientMiddle);
  root.style.setProperty("--bg-stop-2", palette.gradientEnd);
}

function pickRandomPaletteIndex(currentIndex: number, count: number): number {
  if (count <= 1) {
    return 0;
  }

  let nextIndex = currentIndex;
  while (nextIndex === currentIndex) {
    nextIndex = Math.floor(Math.random() * count);
  }
  return nextIndex;
}

function randomBirdColor(): number {
  // Keep birds bright enough to stay readable over dark warm gradients.
  const hue = Math.random() * 360;
  const saturation = 0.35 + Math.random() * 0.55;
  const lightness = 0.72 + Math.random() * 0.2;
  return hslToRgbNumber(hue, saturation, lightness);
}

function rgbNumberToHex(color: number): string {
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(color)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function parseHexToRgbNumber(hex: string): number {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return DEFAULT_PALETTE.particleColor;
  }
  return Number.parseInt(normalized, 16);
}

function hslToRgbNumber(
  hueDegrees: number,
  saturation: number,
  lightness: number,
): number {
  const h = ((hueDegrees % 360) + 360) % 360;
  const s = clamp01(saturation);
  const l = clamp01(lightness);

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  const r = Math.round((rPrime + m) * 255);
  const g = Math.round((gPrime + m) * 255);
  const b = Math.round((bPrime + m) * 255);
  return (r << 16) | (g << 8) | b;
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
    const neighborsPerBoid =
      sample.activeBoids > 0 ? neighborsAvg / sample.activeBoids : 0;

    const fpsLevel: MetricLevel =
      fps >= 55 ? "good" : fps >= 30 ? "warn" : "bad";
    const frameLevel: MetricLevel =
      frameAvgMs <= 16.7 ? "good" : frameAvgMs <= 33.3 ? "warn" : "bad";
    const simLevel: MetricLevel =
      simAvgMs <= 8 ? "good" : simAvgMs <= 16 ? "warn" : "bad";
    const renderLevel: MetricLevel =
      renderAvgMs <= 2 ? "good" : renderAvgMs <= 6 ? "warn" : "bad";
    const jsOtherLevel: MetricLevel =
      jsOtherMs <= 2 ? "good" : jsOtherMs <= 8 ? "warn" : "bad";
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
      formatMetricLine(
        "fps",
        fps.toFixed(1),
        fpsLevel,
        renderMixerBar(fpsLoad),
      ),
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
