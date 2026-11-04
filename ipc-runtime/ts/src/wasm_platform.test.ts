import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { WasmFfiBackend } from "./wasm/backend.js";
import { browserPlatform } from "./wasm/browser/platform.js";
import { isIos } from "./wasm/node/index.js";
import type { WasmPlatform, WorkerHandle } from "./wasm/platform.js";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator",
);

function setNavigator(navigator: object | undefined): void {
  Object.defineProperty(globalThis, "navigator", {
    value: navigator,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

const devices = [
  { device: "an iPhone", userAgent: IPHONE, maxTouchPoints: 5, ios: true },
  { device: "an iPad", userAgent: IPAD, maxTouchPoints: 5, ios: true },
  {
    device: "an iPad or a desktop-mode iPhone (Mac user agent with touch)",
    userAgent: MAC,
    maxTouchPoints: 5,
    ios: true,
  },
  { device: "a Mac", userAgent: MAC, maxTouchPoints: 0, ios: false },
  {
    device: "a worker on a Mac user agent (no maxTouchPoints)",
    userAgent: MAC,
    maxTouchPoints: undefined,
    ios: false,
  },
];

for (const { device, userAgent, maxTouchPoints, ios } of devices) {
  test(`${device} gets the ${ios ? "iOS" : "desktop"} memory maximum`, () => {
    setNavigator({ userAgent, maxTouchPoints });
    assert.equal(isIos(), ios);
    assert.equal(
      browserPlatform.maximumMemoryPages!(),
      ios ? 2 ** 14 : 2 ** 16,
    );
  });
}

test("no navigator gets the desktop memory maximum", () => {
  setNavigator(undefined);
  assert.equal(isIos(), false);
  assert.equal(browserPlatform.maximumMemoryPages!(), 2 ** 16);
});

const EMPTY_MODULE = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);

/** Starts a backend on a stand-in main worker and returns the init message the worker receives. */
async function initMessage(
  platform: WasmPlatform,
  memory?: { maximum?: number },
): Promise<any> {
  let init: any;
  const handlers: ((message: any) => void)[] = [];
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
    { module: EMPTY_MODULE, memory },
    {
      platform,
      createMainWorker: () => worker,
      createThreadWorker: () => worker,
    },
  );
  return init;
}

test("the main worker gets the memory maximum of the thread that creates the backend", async () => {
  const init = await initMessage({
    ...browserPlatform,
    maximumMemoryPages: () => 1234,
  });
  assert.equal(init.options.memory.maximum, 1234);
});

test("a memory maximum that the caller sets wins over the platform's", async () => {
  const init = await initMessage(
    { ...browserPlatform, maximumMemoryPages: () => 1234 },
    { maximum: 99 },
  );
  assert.equal(init.options.memory.maximum, 99);
});
