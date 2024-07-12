import { fileURLToPath } from '@aztec/aztec.js';
import { injectCommands as injectBuilderCommands } from '@aztec/cli/builder';
import { injectCommands as injectContractCommands } from '@aztec/cli/contracts';
import { injectCommands as injectInfrastructureCommands } from '@aztec/cli/infrastructure';
import { injectCommands as injectL1Commands } from '@aztec/cli/l1';
import { injectCommands as injectPXECommands } from '@aztec/cli/pxe';
import { injectCommands as injectUtilsCommands } from '@aztec/cli/utils';
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
  let program = new Command('aztec');
  program.description('Aztec command line interface').version(cliVersion);
  program = await injectAztecCommands(program, userLog, debugLogger);
  program = await injectBuilderCommands(program, userLog);
  program = await injectContractCommands(program, userLog, debugLogger);
  program = await injectInfrastructureCommands(program, userLog, debugLogger);
  program = await injectL1Commands(program, userLog, debugLogger);
  program = await injectPXECommands(program, userLog, debugLogger);
  program = await injectUtilsCommands(program, userLog);

  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
