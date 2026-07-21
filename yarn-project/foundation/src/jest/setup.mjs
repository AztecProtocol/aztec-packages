import { parseBooleanEnv } from '@aztec/foundation/config';
import { overwriteLoggingStream, pinoPrettyOpts } from '@aztec/foundation/log';

import pretty from 'pino-pretty';

// Overwrite logging stream with pino-pretty. We define this as a separate
// file so we don't mess up with dependencies in non-testing environments,
// since pino-pretty messes up with browser bundles.
// See also https://www.npmjs.com/package/pino-pretty?activeTab=readme#user-content-usage-with-jest
if (!parseBooleanEnv(process.env.LOG_JSON)) {
  overwriteLoggingStream(pretty(pinoPrettyOpts));
}

// Prevent timers from keeping the process alive after tests complete.
// Libraries like viem create internal polling loops (via setTimeout) that
// reschedule themselves indefinitely. In test environments we never want a
// timer to be the reason the process can't exit. We also unref stdout/stderr
// which, when they are pipes (as in Jest workers), remain ref'd by default.
{
  const origSetTimeout = globalThis.setTimeout;
  const origSetInterval = globalThis.setInterval;
  globalThis.setTimeout = function unrefSetTimeout(...args) {
    const id = origSetTimeout.apply(this, args);
    id?.unref?.();
    return id;
  };
  // Preserve .unref, .__promisify__ etc. that may exist on the original
  Object.setPrototypeOf(globalThis.setTimeout, origSetTimeout);

  globalThis.setInterval = function unrefSetInterval(...args) {
    const id = origSetInterval.apply(this, args);
    id?.unref?.();
    return id;
  };
  Object.setPrototypeOf(globalThis.setInterval, origSetInterval);

  if (process.stdout?._handle?.unref) process.stdout._handle.unref();
  if (process.stderr?._handle?.unref) process.stderr._handle.unref();
}
