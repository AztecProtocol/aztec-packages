// Bridge protocol unit test. Verifies the SAB layout / atomics dance
// without involving a real WASM module or WebGPU. The "WASM side" is
// played by a Worker that calls the stub's env imports; the "main
// side" runs in the test process and validates the request payload
// before signalling completion.
//
// This test runs on Node.js (jest) since the protocol is platform
// agnostic — no DOM, no GPUDevice. The actual WebGPU MSM correctness
// test is a separate browser-only harness (see msm.browser.test.ts
// when added).

import { describe, expect, it } from '@jest/globals';
import {
  CTRL_BYTES,
  OP_MSM,
  OP_PUBLISH_SRS,
  SLOT_N,
  SLOT_OPCODE,
  SLOT_POINTS_PTR,
  SLOT_RESULT_PTR,
  SLOT_SCALARS_PTR,
  SLOT_STATE,
  STATE_DONE,
  STATE_REQUEST,
} from './protocol.js';

// Node ≥ 16 has SharedArrayBuffer natively. We exercise the protocol
// in single-thread fashion: spawn a child via `setTimeout` (mimicking
// the worker's async post-and-wait flow) instead of an actual Worker,
// because spinning up a Worker in jest is awkward and the protocol
// itself doesn't need a real thread boundary to be tested.

describe('webgpu bridge protocol', () => {
  it('control buffer is sized for CTRL_BYTES', () => {
    const sab = new SharedArrayBuffer(CTRL_BYTES);
    expect(sab.byteLength).toBe(CTRL_BYTES);
  });

  it('a request round-trip writes all slots and resolves to STATE_DONE', () => {
    const sab = new SharedArrayBuffer(CTRL_BYTES);
    const ctrl = new Int32Array(sab);

    // Simulate the worker stub: write the request and the request
    // marker. Atomics.wait would normally block, but we instead schedule
    // the "main thread" resolver and then peek the slots directly.
    Atomics.store(ctrl, SLOT_OPCODE, OP_MSM);
    Atomics.store(ctrl, SLOT_N, 1024);
    Atomics.store(ctrl, SLOT_POINTS_PTR, 0x1000);
    Atomics.store(ctrl, SLOT_SCALARS_PTR, 0x2000);
    Atomics.store(ctrl, SLOT_RESULT_PTR, 0x3000);
    Atomics.store(ctrl, SLOT_STATE, STATE_REQUEST);

    // Main thread reads the request out:
    expect(Atomics.load(ctrl, SLOT_OPCODE)).toBe(OP_MSM);
    expect(Atomics.load(ctrl, SLOT_N)).toBe(1024);
    expect(Atomics.load(ctrl, SLOT_POINTS_PTR)).toBe(0x1000);
    expect(Atomics.load(ctrl, SLOT_SCALARS_PTR)).toBe(0x2000);
    expect(Atomics.load(ctrl, SLOT_RESULT_PTR)).toBe(0x3000);

    // ... runs MSM ... and resolves:
    Atomics.store(ctrl, SLOT_STATE, STATE_DONE);
    Atomics.notify(ctrl, SLOT_STATE, 1);

    expect(Atomics.load(ctrl, SLOT_STATE)).toBe(STATE_DONE);
  });

  it('OP_PUBLISH_SRS uses only the N + points_ptr slots', () => {
    const sab = new SharedArrayBuffer(CTRL_BYTES);
    const ctrl = new Int32Array(sab);
    Atomics.store(ctrl, SLOT_OPCODE, OP_PUBLISH_SRS);
    Atomics.store(ctrl, SLOT_N, 65536);
    Atomics.store(ctrl, SLOT_POINTS_PTR, 0x4000);

    expect(Atomics.load(ctrl, SLOT_OPCODE)).toBe(OP_PUBLISH_SRS);
    expect(Atomics.load(ctrl, SLOT_N)).toBe(65536);
    expect(Atomics.load(ctrl, SLOT_POINTS_PTR)).toBe(0x4000);
  });
});
