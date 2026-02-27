import { Application, MeshSimple, Texture } from "pixi.js";
import type { BLEND_MODES } from "pixi.js";

export interface FlockTheme {
  backgroundColor: number;
  backgroundAlpha: number;
  particleColor: number;
  particleAlpha: number;
  blendMode: BLEND_MODES;
  particleSize: number;
}

export interface FlockViewOptions {
  dprCap?: number;
  renderScale?: number;
}

const UVS_PER_PARTICLE = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);

export const DEFAULT_FLOCK_THEME: FlockTheme = {
  backgroundColor: 0x04070d,
  backgroundAlpha: 1.0,
  particleColor: 0xcfe7ff,
  particleAlpha: 0.72,
  blendMode: "add",
  particleSize: 2.4,
};

export class FlockView {
  private readonly host: HTMLElement;
  private readonly app: Application;
  private readonly dprCap: number;
  private readonly renderScale: number;
  private readonly particleTexture: Texture;

  private theme: FlockTheme;
  private mesh: MeshSimple | null = null;
  private vertices: Float32Array = new Float32Array(0);
  private particleCount = 0;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastResolution = 0;

  private constructor(
    host: HTMLElement,
    app: Application,
    particleTexture: Texture,
    options?: FlockViewOptions,
  ) {
    this.host = host;
    this.app = app;
    this.particleTexture = particleTexture;
    this.dprCap = options?.dprCap ?? 2;
    this.renderScale = options?.renderScale ?? 1;
    this.theme = DEFAULT_FLOCK_THEME;
  }

  static async create(
    host: HTMLElement,
    options?: FlockViewOptions,
  ): Promise<FlockView> {
    const app = new Application();
    const renderer = new FlockView(
      host,
      app,
      FlockView.createParticleTexture(),
      options,
    );
    await renderer.init();
    return renderer;
  }

  setTheme(theme: FlockTheme): void {
    this.theme = theme;
    this.app.renderer.background.color = theme.backgroundColor;
    this.app.renderer.background.alpha = theme.backgroundAlpha;

    if (!this.mesh) {
      this.app.render();
      return;
    }

    this.mesh.tint = theme.particleColor;
    this.mesh.alpha = theme.particleAlpha;
    this.mesh.blendMode = theme.blendMode;
    this.app.render();
  }

  render(
    positions: Float32Array,
    depth?: Float32Array,
    sampleStride = 1,
    maxCount?: number,
  ): void {
    const availableCount = positions.length >>> 1;
    const totalCount =
      maxCount === undefined
        ? availableCount
        : Math.max(0, Math.min(availableCount, Math.floor(maxCount)));
    const stride = Math.max(1, Math.floor(sampleStride));
    const nextCount = Math.ceil(totalCount / stride);
    if (!this.mesh || nextCount !== this.particleCount) {
      this.rebuildMesh(nextCount);
    }

    if (!this.mesh || nextCount === 0) {
      this.app.render();
      return;
    }

    const width = this.app.screen.width * this.renderScale;
    const height = this.app.screen.height * this.renderScale;
    const hasDepth = Boolean(depth) && (depth?.length ?? 0) >= totalCount;
    const baseHalfSize = this.theme.particleSize * 0.5;

    let renderIndex = 0;
    for (let sourceIndex = 0; sourceIndex < totalCount; sourceIndex += stride) {
      const p = sourceIndex * 2;
      const x = positions[p] * width;
      const y = positions[p + 1] * height;
      const v = renderIndex * 8;
      const z = hasDepth ? clamp01(depth![sourceIndex]) : DEFAULT_Z_LAYER;
      const halfSize = baseHalfSize * (0.55 + 0.9 * z);

      this.vertices[v] = x - halfSize;
      this.vertices[v + 1] = y - halfSize;
      this.vertices[v + 2] = x + halfSize;
      this.vertices[v + 3] = y - halfSize;
      this.vertices[v + 4] = x + halfSize;
      this.vertices[v + 5] = y + halfSize;
      this.vertices[v + 6] = x - halfSize;
      this.vertices[v + 7] = y + halfSize;
      renderIndex += 1;
    }

    this.mesh.geometry.getBuffer("aPosition").update();
    this.app.render();
  }

  resize(nextWidth?: number, nextHeight?: number): void {
    const width = Math.floor(nextWidth ?? this.host.clientWidth);
    const height = Math.floor(nextHeight ?? this.host.clientHeight);
    if (width < 1 || height < 1) {
      // Fullscreen transitions can briefly report zero-sized host bounds.
      return;
    }

    const resolution = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const hasSizeChange = width !== this.lastWidth || height !== this.lastHeight;
    const hasResolutionChange = resolution !== this.lastResolution;
    if (!hasSizeChange && !hasResolutionChange) {
      return;
    }

    this.lastWidth = width;
    this.lastHeight = height;
    this.lastResolution = resolution;
    this.app.renderer.resolution = resolution;
    this.app.renderer.resize(width, height);
    this.app.render();
  }

  private async init(): Promise<void> {
    await this.app.init({
      preference: "webgl",
      autoStart: false,
      antialias: false,
      autoDensity: true,
      clearBeforeRender: true,
      resolution: Math.min(window.devicePixelRatio || 1, this.dprCap),
      backgroundColor: this.theme.backgroundColor,
      backgroundAlpha: this.theme.backgroundAlpha,
    });

    this.host.appendChild(this.app.canvas);
    this.setTheme(this.theme);
    this.resize();
    this.app.render();
  }

  private rebuildMesh(count: number): void {
    if (this.mesh) {
      this.app.stage.removeChild(this.mesh);
      this.mesh.destroy();
      this.mesh = null;
    }

    this.particleCount = count;
    this.vertices = new Float32Array(count * 8);
    const uvs = new Float32Array(count * 8);
    const indices = new Uint32Array(count * 6);

    for (let i = 0; i < count; i += 1) {
      const u = i * 8;
      uvs.set(UVS_PER_PARTICLE, u);

      const baseIndex = i * 6;
      const vertexOffset = i * 4;
      indices[baseIndex] = vertexOffset;
      indices[baseIndex + 1] = vertexOffset + 1;
      indices[baseIndex + 2] = vertexOffset + 2;
      indices[baseIndex + 3] = vertexOffset;
      indices[baseIndex + 4] = vertexOffset + 2;
      indices[baseIndex + 5] = vertexOffset + 3;
    }

    this.mesh = new MeshSimple({
      texture: this.particleTexture,
      vertices: this.vertices,
      uvs,
      indices,
    });
    this.mesh.blendMode = this.theme.blendMode;
    this.mesh.alpha = this.theme.particleAlpha;
    this.mesh.tint = this.theme.particleColor;
    this.app.stage.addChild(this.mesh);
  }

  private static createParticleTexture(): Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to create 2D context for particle texture");
    }

    ctx.clearRect(0, 0, 32, 32);
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();

    return Texture.from(canvas);
  }
}

const DEFAULT_Z_LAYER = 0.5;

function clamp01(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}
