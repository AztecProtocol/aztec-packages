// Global setup for vitest - runs before browser is launched.
// Includes a watchdog timer to detect and fail fast on browser launch hangs,
// which occur intermittently in CI containers.

let watchdog: ReturnType<typeof setTimeout> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;

const WATCHDOG_TIMEOUT_MS = 120_000; // 2 minutes — more than enough for browser startup

export async function setup() {
  console.log('[global-setup] Starting global setup...');
  console.log('[global-setup] Node version:', process.version);
  console.log('[global-setup] Platform:', process.platform);
  console.log('[global-setup] CI:', process.env.CI);
  console.log('[global-setup] PLAYWRIGHT_BROWSERS_PATH:', process.env.PLAYWRIGHT_BROWSERS_PATH);

  const startTime = Date.now();

  // Heartbeat: log every 10 seconds so we can see the process is alive during the hang
  heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[global-setup] Heartbeat: still waiting for browser tests to start (${elapsed}s elapsed)`);
  }, 10_000);
  heartbeat.unref();

  // Watchdog: if tests haven't started within 2 minutes, something is hung
  // (Vite dep optimization, Playwright browser launch, etc.). Force-exit so CI can retry.
  watchdog = setTimeout(() => {
    console.error('[global-setup] WATCHDOG: Browser tests did not start within 2 minutes. Force exiting.');
    process.exit(1);
  }, WATCHDOG_TIMEOUT_MS);
  watchdog.unref();

  console.log('[global-setup] Global setup complete, browser should launch next...');
}

export async function teardown() {
  if (heartbeat) {
    clearInterval(heartbeat);
  }
  if (watchdog) {
    clearTimeout(watchdog);
  }
  console.log('[global-teardown] Global teardown complete');
}
