import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { WasmFfiBackend } from "./wasm/backend.js";
import { browserPlatform } from "./wasm/browser/platform.js";
import type { WorkerHandle } from "./wasm/platform.js";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")!;
afterEach(() => Object.defineProperty(globalThis, "navigator", realNavigator));

for (const [device, userAgent, maxTouchPoints, pages] of [
  ["an iPhone", IPHONE, 5, 2 ** 14],
  ["an iPad", IPAD, 5, 2 ** 14],
  ["a Mac user agent with touch points", MAC, 5, 2 ** 14],
  ["a Mac", MAC, 0, 2 ** 16],
  ["a worker (no touch points) on an iPad or a Mac", MAC, undefined, 2 ** 16],
] as const) {
  test(`${device} gets a maximum of ${pages} memory pages`, () => {
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent, maxTouchPoints },
      configurable: true,
    });
    assert.equal(browserPlatform.maximumMemoryPages!(), pages);
  });
}

async function mainWorkerMaximum(callerMaximum?: number): Promise<number> {
  let init: any;
  const handlers: ((message: unknown) => void)[] = [];
  const worker: WorkerHandle = {
    postMessage: (message) => {
      init = message;
      queueMicrotask(() => handlers.forEach((h) => h({ type: "ready" })));
    },
    onMessage: (handler) => handlers.push(handler),
    onError: () => {},
    terminate: async () => {},
    unref: () => {},
  };
  await WasmFfiBackend.create(
    {
      module: new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]),
      memory: { maximum: callerMaximum },
    },
    {
      platform: { ...browserPlatform, maximumMemoryPages: () => 1234 },
      createMainWorker: () => worker,
      createThreadWorker: () => worker,
    },
  );
  return init.options.memory.maximum;
}

test("the main worker gets the caller's memory maximum, else that of the thread that creates it", async () => {
  assert.equal(await mainWorkerMaximum(99), 99);
  assert.equal(await mainWorkerMaximum(), 1234);
});
