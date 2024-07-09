import { createConsoleLogger, createDebugLogger } from '@aztec/foundation/log';

import { getProgram } from '../cli/index.js';

const userLog = createConsoleLogger();
const debugLogger = createDebugLogger('aztec:cli');

const {} = process.env;

/** CLI & full node main entrypoint */
async function main() {
  const cliProgram = getProgram(userLog, debugLogger);
  await cliProgram.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
