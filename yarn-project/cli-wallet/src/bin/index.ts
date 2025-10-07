import { Fr, ProtocolContractAddress, computeSecretHash, createAztecNodeClient, fileURLToPath } from '@aztec/aztec.js';
import { LOCALHOST } from '@aztec/cli/cli-utils';
import { type LogFn, createConsoleLogger, createLogger } from '@aztec/foundation/log';
import { openStoreAt } from '@aztec/kv-store/lmdb-v2';
import type { PXEConfig } from '@aztec/pxe/config';
import { getPackageVersion } from '@aztec/stdlib/update-checker';

import { Argument, Command, Option } from 'commander';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';

import { injectCommands } from '../cmds/index.js';
import { Aliases, WalletDB } from '../storage/wallet_db.js';
import { CliWalletAndNodeWrapper } from '../utils/cli_wallet_and_node_wrapper.js';
import { createAliasOption } from '../utils/options/index.js';
import { CLIWallet } from '../utils/wallet.js';

const userLog = createConsoleLogger();
const debugLogger = createLogger('wallet');

const { WALLET_DATA_DIRECTORY = join(homedir(), '.aztec/wallet') } = process.env;

// TODO: This function is only used in 1 place so we could just inline this
function injectInternalCommands(program: Command, log: LogFn, db: WalletDB) {
  program
    .command('alias')
    .description('Aliases information for easy reference.')
    .addArgument(new Argument('<type>', 'Type of alias to create').choices(Aliases))
    .argument('<key>', 'Key to alias.')
    .argument('<value>', 'Value to assign to the alias.')
    .action(async (type, key, value) => {
      value = db.tryRetrieveAlias(value) || value;
      await db.storeAlias(type, key, value, log);
    });

  program
    .command('get-alias')
    .description('Shows stored aliases')
    .addArgument(new Argument('[alias]', 'Alias to retrieve'))
    .action(async alias => {
      if (alias?.includes(':')) {
        const value = await db.retrieveAlias(alias);
        log(value);
      } else {
        const aliases = await db.listAliases(alias);
        for (const { key, value } of aliases) {
          log(`${key} -> ${value}`);
        }
      }
    });

  program
    .command('create-secret')
    .description('Creates an aliased secret to use in other commands')
    .addOption(createAliasOption('Key to alias the secret with', false).makeOptionMandatory(true))
    .action(async (_options, command) => {
      const options = command.optsWithGlobals();
      const { alias } = options;
      const value = Fr.random();
      const hash = await computeSecretHash(value);

      await db.storeAlias('secrets', alias, Buffer.from(value.toString()), log);
      await db.storeAlias('secrets', `${alias}:hash`, Buffer.from(hash.toString()), log);
    });

  return program;
}

/** CLI wallet main entrypoint */
async function main() {
  const walletVersion = getPackageVersion() ?? '0.0.0';

  const db = WalletDB.getInstance();
  const walletAndNodeWrapper = new CliWalletAndNodeWrapper();

  const program = new Command('wallet');
  program
    .description('Aztec wallet')
    .version(walletVersion)
    .option('-d, --data-dir <string>', 'Storage directory for wallet data', WALLET_DATA_DIRECTORY)
    .addOption(
      new Option('-p, --prover <string>', 'The type of prover the wallet uses')
        .choices(['wasm', 'native', 'none'])
        .env('PXE_PROVER')
        .default('native'),
    )
    .addOption(
      new Option('-n, --node-url <string>', 'URL of the Aztec node to connect to')
        .env('AZTEC_NODE_URL')
        .default(`http://${LOCALHOST}:8080`),
    )
    .hook('preSubcommand', async command => {
      const { dataDir, nodeUrl, prover } = command.optsWithGlobals();

      const proverEnabled = prover !== 'none';

      const bbBinaryPath =
        prover === 'native'
          ? resolve(dirname(fileURLToPath(import.meta.url)), '../../../../barretenberg/cpp/build/bin/bb')
          : undefined;
      const bbWorkingDirectory = dataDir + '/bb';
      mkdirSync(bbWorkingDirectory, { recursive: true });

      const overridePXEConfig: Partial<PXEConfig> = {
        proverEnabled,
        bbBinaryPath: prover === 'native' ? bbBinaryPath : undefined,
        bbWorkingDirectory: prover === 'native' ? bbWorkingDirectory : undefined,
        dataDirectory: join(dataDir, 'pxe'),
      };

      const node = createAztecNodeClient(nodeUrl);
      const wallet = await CLIWallet.create(node, userLog, db, overridePXEConfig);

      walletAndNodeWrapper.setNodeAndWallet(node, wallet);

      await db.init(await openStoreAt(dataDir));
      let protocolContractsRegistered;
      try {
        protocolContractsRegistered = !!(await db.retrieveAlias('contracts:ContractClassRegistry'));
        // eslint-disable-next-line no-empty
      } catch {}
      if (!protocolContractsRegistered) {
        userLog('Registering protocol contract aliases...');
        for (const [name, address] of Object.entries(ProtocolContractAddress)) {
          await db.storeAlias('contracts', name, Buffer.from(address.toString()), userLog);
          await db.storeAlias(
            'artifacts',
            address.toString(),
            Buffer.from(`${name.slice(0, 1).toUpperCase()}${name.slice(1)}`),
            userLog,
          );
        }
      }
    });

  injectCommands(program, userLog, debugLogger, walletAndNodeWrapper, db);
  injectInternalCommands(program, userLog, db);
  await program.parseAsync(process.argv);
}

main().catch(err => {
  debugLogger.error(`Error in command execution`);
  debugLogger.error(err + '\n' + err.stack);
  process.exit(1);
});
