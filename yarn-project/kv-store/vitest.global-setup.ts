// Global setup for vitest - runs before browser is launched
export async function setup() {
  console.log('[global-setup] Starting global setup...');
  console.log('[global-setup] Node version:', process.version);
  console.log('[global-setup] Platform:', process.platform);
  console.log('[global-setup] CI:', process.env.CI);
  console.log('[global-setup] PLAYWRIGHT_BROWSERS_PATH:', process.env.PLAYWRIGHT_BROWSERS_PATH);
  console.log('[global-setup] Global setup complete, browser should launch next...');
}

export async function teardown() {
  console.log('[global-teardown] Global teardown starting...');
  console.log('[global-teardown] Global teardown complete');
}
