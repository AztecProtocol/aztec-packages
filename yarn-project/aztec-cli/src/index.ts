#!/usr/bin/env node
import { Command } from 'commander';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { mnemonicToAccount } from 'viem/accounts';
import { createDebugLogger } from '@aztec/foundation';
import { HttpNode } from './http-node.js';
import { deployL2Contract, deployL2ContractAndMakeTransfers } from './deploy_l2_contract.js';

const logger = createDebugLogger('aztec:cli');

const program = new Command();

async function deployRollupContracts(rpcUrl: string, mnemonic: string) {
  const account = mnemonicToAccount(mnemonic);
  await deployL1Contracts(rpcUrl, account, logger);
}

async function doCommand(rpcUrl: string) {
  const httpNode = new HttpNode(rpcUrl);
  const isReady = await httpNode.getBlocks(1, 10);
  console.log(`Is Ready ${isReady}`);
}

/**
 * A placeholder for the Aztec-cli.
 */
async function main() {
  program
    .command('run')
    .argument('<cmd>', 'command')
    .action((cmd: string) => {
      console.log(`Running '${cmd}'...`);
    });

  program
    .command('deployRollupContracts')
    .argument('[rpcUrl]', 'url of the ethereum host', 'http://localhost:8545')
    .argument(
      '[mnemonic]',
      'the mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .action(async (rpcUrl: string, mnemonic: string) => {
      await deployRollupContracts(rpcUrl, mnemonic);
    });

  program
    .command('deploy')
    .argument('[rpcUrl]', 'url of the rollup provider', 'http://localhost:9000')
    .argument('[interval]', 'interval between contract deployments', 0)
    .action(async (rpcUrl: string, intervalArg: string) => {
      try {
        const interval = Number(intervalArg);
        await deployL2Contract(rpcUrl, logger, interval != 0, interval);
      } catch (err) {
        logger(`Error`, err);
      }
    });

  program
    .command('transfer')
    .argument('[rpcUrl]', 'url of the rollup provider', 'http://localhost:9000')
    .action(async (rpcUrl: string) => {
      try {
        await deployL2ContractAndMakeTransfers(rpcUrl, logger);
      } catch (err) {
        logger(`Error`, err);
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.log(`Error thrown: ${err}`);
  process.exit(1);
});
