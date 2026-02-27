# flockround

Modular boids simulation with Rust/WASM for simulation and Vite + TypeScript + PixiJS for rendering.

## Requirements

- Node.js `22.16.0` (see `.nvmrc`)
- npm `10.9.2` (see `packageManager` in root `package.json`)
- Rust `1.92.0` with `rustfmt` and `clippy` (see `rust-toolchain.toml`)
- `wasm-pack` `0.13.x`

Install wasm-pack (if needed):

```bash
cargo install wasm-pack --version 0.13.1
```

## Quick start

```bash
nvm use
npm install
npm run dev
```

Expected startup behavior:
- Vite serves the web app.
- A blank Pixi canvas fills the screen.
- Browser console logs `WASM loaded`.

## Build

```bash
npm run build
```

## Lint/format

TypeScript:

```bash
npm run lint
npm run format
```

Rust:

```bash
cargo fmt --manifest-path sim-wasm/Cargo.toml
cargo clippy --manifest-path sim-wasm/Cargo.toml --all-targets -- -D warnings
```

## Makefile shortcuts

```bash
make install
make dev
make build
make check
make format
```
