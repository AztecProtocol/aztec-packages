import type { LogFn } from '@aztec/foundation/log';

import type { Command } from 'commander';

import { ETHEREUM_HOSTS, l1ChainIdOption, nodeOption, parseOptionalInteger, pxeOption } from '../../utils/commands.js';

export function injectCommands(program: Command, log: LogFn) {
  program
    .command('setup-protocol-contracts')
    .description('Bootstrap the blockchain by initializing all the protocol contracts')
    .addOption(pxeOption)
    .addOption(nodeOption)
    .option('--testAccounts', 'Deploy funded test accounts.')
    .option('--sponsoredFPC', 'Deploy a sponsored FPC.')
    .option('--json', 'Output the contract addresses in JSON format')
    .action(async options => {
      const { setupL2Contracts } = await import('./setup_l2_contract.js');
      await setupL2Contracts(
        options.rpcUrl,
        options.nodeUrl,
        options.testAccounts,
        options.sponsoredFPC,
        options.json,
        log,
      );
    });

  program
    .command('sequencers')
    .argument('<command>', 'Command to run: list, add, remove, who-next')
    .argument('[who]', 'Who to add/remove')
    .description('Manages or queries registered sequencers on the L1 rollup contract.')
    .requiredOption<string[]>(
      '--l1-rpc-urls <string>',
      'List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated)',
      (arg: string) => arg.split(','),
      [ETHEREUM_HOSTS],
    )
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic for the sender of the tx',
      'test test test test test test test test test test test junk',
    )
    .option('--block-number <number>', 'Block number to query next sequencer for', parseOptionalInteger)
    .addOption(nodeOption)
    .addOption(l1ChainIdOption)
    .action(async (command, who, options) => {
      const { sequencers } = await import('./sequencers.js');
      await sequencers({
        command: command,
        who,
        mnemonic: options.mnemonic,
        nodeUrl: options.nodeUrl,
        l1RpcUrls: options.l1RpcUrls,
        chainId: options.l1ChainId,
        blockNumber: options.blockNumber,
        log,
      });
    });

  return program;
}
