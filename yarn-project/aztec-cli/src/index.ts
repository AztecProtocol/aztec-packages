#!/usr/bin/env node
import { createLogger } from '@aztec/foundation/log';
import { Command } from 'commander';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import { createDebugLogger } from '@aztec/foundation/log';
import { createAztecChain } from '@aztec/environment';
import { deployL2Contract } from './deploy_l2_contract.js';

const logger = createDebugLogger('aztec:cli');

const program = new Command();
const log = createLogger('aztec:aztec-cli');

async function deployRollupContracts(rpcUrl: string, apiKey: string, privateKey: string, mnemonic: string) {
  const account = privateKey ? privateKeyToAccount(`0x${privateKey}`) : mnemonicToAccount(mnemonic!);
  const chain = createAztecChain(rpcUrl, apiKey);
  await deployL1Contracts(chain.rpcUrl, account, chain.chainInfo, logger);
}

/**
 * A placeholder for the Aztec-cli.
 */
async function main() {
  program
    .command('run')
    .argument('<cmd>', 'Command')
    .action((cmd: string) => {
      log(`Running '${cmd}'...`);
    });

  program
    .command('deployRollupContracts')
    .argument(
      '[rpcUrl]',
      'Url of the ethereum host. Chain identifiers localhost and testnet can be used',
      'http://localhost:8545',
    )
    .argument('[apiKey]', 'Api key for the ethereum host', '')
    .option('-p, --privateKey <string>', 'The private key to use for deployment')
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .action(async (rpcUrl: string, apiKey: string, options) => {
      await deployRollupContracts(rpcUrl, apiKey, options.privateKey, options.mnemonic);
    });

  program
    .command('deploy')
    .argument('[rpcUrl]', 'Url of the rollup provider', 'http://localhost:9000')
    .argument('[interval]', 'Interval between contract deployments (seconds), 0 means only a single deployment', 60)
    .action(async (rpcUrl: string, intervalArg: string) => {
      try {
        const interval = Number(intervalArg);
        await deployL2Contract(rpcUrl, interval * 1000, logger);
      } catch (err) {
        logger(`Error`, err);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  log(`Error thrown: ${err}`);
  process.exit(1);
});
