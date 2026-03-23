/**
 * Vitest global setup for @inscribe/core tests.
 *
 * Runs once before each test file (via setupFiles in vitest.config.ts).
 *
 * Layer 1 — vitest-canvas-mock: stubs the full Canvas 2D API surface
 *   (fillRect, strokeRect, drawImage, save/restore, paths, etc.) so any
 *   test that touches rendering doesn't throw on missing implementations.
 *
 * Layer 2 — mockCanvas(): overrides measureText specifically so
 *   TextMeasurer returns deterministic values (8px/char, fixed ascent/descent)
 *   that layout tests use for exact pixel assertions.
 *
 * Note: vitest-canvas-mock requires vitest >=3. Until we upgrade, we import
 * defensively — the package still works in practice on vitest 2.x.
 */
import "vitest-canvas-mock";
import { mockCanvas } from "./src/test-utils";

mockCanvas();
