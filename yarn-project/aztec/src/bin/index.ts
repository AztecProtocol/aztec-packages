#!/usr/bin/env node
import { fileURLToPath } from '@aztec/aztec.js';
import { injectCommands as injectBuilderCommands } from '@aztec/builder';
import { injectCommands as injectWalletCommands } from '@aztec/cli-wallet';
import { injectCommands as injectContractCommands } from '@aztec/cli/contracts';
import { injectCommands as injectDevnetCommands } from '@aztec/cli/devnet';
import { injectCommands as injectInfrastructureCommands } from '@aztec/cli/infrastructure';
import { injectCommands as injectL1Commands } from '@aztec/cli/l1';
import { injectCommands as injectMiscCommands } from '@aztec/cli/misc';
import { injectCommands as injectPXECommands } from '@aztec/cli/pxe';
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
  program = injectAztecCommands(program, userLog, debugLogger);
  program = injectBuilderCommands(program);
  program = injectContractCommands(program, userLog, debugLogger);
  program = injectInfrastructureCommands(program, userLog, debugLogger);
  program = injectL1Commands(program, userLog, debugLogger);
  program = injectPXECommands(program, userLog, debugLogger);
  program = injectMiscCommands(program, userLog);
  program = injectDevnetCommands(program, userLog, debugLogger);
  program = injectWalletCommands(program, userLog, debugLogger);

  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
