import { fileURLToPath } from '@aztec/aztec.js';
import { injectCommands as injectBuilderCommands } from '@aztec/cli/builder';
import { injectCommands as injectInfrastructureCommands } from '@aztec/cli/infrastructure';
import { createConsoleLogger, createDebugLogger } from '@aztec/foundation/log';

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { injectAztecCommands } from '../cli/index.js';

const userLog = createConsoleLogger();
const debugLogger = createDebugLogger('aztec:cli');

/** CLI & full node main entrypoint */
async function main() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const cliVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;
  let program = new Command();
  program.name('aztec').description('Aztec command line interface').version(cliVersion);
  program = await injectAztecCommands(program, userLog, debugLogger);
  program = await injectBuilderCommands(program, userLog);
  program = await injectInfrastructureCommands(program, userLog, debugLogger);

  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
