.PHONY: install dev build lint format check test wasm-dev wasm-build wasm-format wasm-check

install:
	npm install

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

format:
	npm run format
	npm run wasm:format

check:
	npm run check

# Keep test lightweight for now; Rust tests can grow with later tasks.
test:
	npm run test

wasm-dev:
	npm run wasm:build:dev

wasm-build:
	npm run wasm:build:release

wasm-format:
	npm run wasm:format

wasm-check:
	npm run wasm:check
