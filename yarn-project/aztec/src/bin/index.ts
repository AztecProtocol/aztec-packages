import { createConsoleLogger, createDebugLogger } from '@aztec/foundation/log';

import { getProgram } from '../cli/index.js';

const userLog = createConsoleLogger();
const debugLogger = createDebugLogger('aztec:cli');

/** CLI main entrypoint */
async function main() {
  const program = getProgram(userLog, debugLogger);
  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger(`Error in command execution`);
  debugLogger(err);
  process.exit(1);
});
