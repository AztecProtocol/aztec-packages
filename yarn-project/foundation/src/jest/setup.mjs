import { overwriteLoggingStream, pinoPrettyOpts } from '@aztec/foundation/log';

import pretty from 'pino-pretty';

// Overwrite logging stream with pino-pretty. We define this as a separate
// file so we don't mess up with dependencies in non-testing environments,
// since pino-pretty messes up with browser bundles.
// See also https://www.npmjs.com/package/pino-pretty?activeTab=readme#user-content-usage-with-jest
overwriteLoggingStream(pretty(pinoPrettyOpts));
