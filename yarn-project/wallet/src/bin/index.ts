import { fileURLToPath } from '@aztec/aztec.js';
import { createDebugLogger } from '@aztec/foundation/log';

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

const debugLogger = createDebugLogger('aztec:wallet');

/** CLI & full node main entrypoint */
async function main() {
  const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
  const walletVersion: string = JSON.parse(readFileSync(packageJsonPath).toString()).version;
  let program = new Command('wallet');
  program.description('Aztec wallet').version(walletVersion);

  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
