import type { LogFn, Logger } from '@aztec/foundation/log';

import type { Command } from 'commander';

import {
  logJson,
  nodeOption,
  parseAztecAddress,
  parseField,
  parseOptionalInteger,
  parseOptionalLogCursor,
  parseOptionalTxHash,
  parseTag,
} from '../../utils/commands.js';

export function injectCommands(program: Command, log: LogFn, debugLogger: Logger) {
  program
    .command('get-block')
    .description('Gets info for a given block or latest.')
    .argument('[blockNumber]', 'Block height', parseOptionalInteger)
    .addOption(nodeOption)
    .action(async (blockNumber, options) => {
      const { getBlock } = await import('./get_block.js');
      await getBlock(options.nodeUrl, blockNumber, log);
    });

  program
    .command('get-current-min-fee')
    .description('Gets the current base fee.')
    .addOption(nodeOption)
    .action(async options => {
      const { getCurrentMinFee } = await import('./get_current_min_fee.js');
      await getCurrentMinFee(options.rpcUrl, debugLogger, log);
    });

  program
    .command('get-l1-to-l2-message-witness')
    .description('Gets a L1 to L2 message witness.')
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', parseAztecAddress)
    .requiredOption('--message-hash <messageHash>', 'The L1 to L2 message hash.', parseField)
    .requiredOption('--secret <secret>', 'The secret used to claim the L1 to L2 message', parseField)
    .addOption(nodeOption)
    .action(async ({ contractAddress, messageHash, secret, nodeUrl }) => {
      const { getL1ToL2MessageWitness } = await import('./get_l1_to_l2_message_witness.js');
      await getL1ToL2MessageWitness(nodeUrl, contractAddress, messageHash, secret, log);
    });

  program
    .command('get-logs')
    .description('Gets public logs for a contract and tag, optionally restricted by block range or tx hash.')
    .requiredOption('-ca, --contract-address <address>', 'Contract address that emitted the logs.', parseAztecAddress)
    .requiredOption('--tag <tag>', 'Tag (Fr value) to filter logs by.', parseTag)
    .option('-tx, --tx-hash <txHash>', 'A transaction hash to restrict the search to.', parseOptionalTxHash)
    .option(
      '-fb, --from-block <blockNum>',
      'Initial block number for getting logs (defaults to 1).',
      parseOptionalInteger,
    )
    .option('-tb, --to-block <blockNum>', 'Up to which block to fetch logs (defaults to latest).', parseOptionalInteger)
    .option(
      '-al --after-log <cursor>',
      'Log cursor of the form <blockNumber>-<txHash>-<logIndexWithinTx> to resume pagination after.',
      parseOptionalLogCursor,
    )
    .addOption(nodeOption)
    .option('--follow', 'If set, will keep polling for new logs until interrupted.')
    .action(
      async ({ txHash, fromBlock, toBlock, afterLog, contractAddress, tag, aztecNodeRpcUrl: nodeUrl, follow }) => {
        const { getLogs } = await import('./get_logs.js');
        await getLogs({ txHash, fromBlock, toBlock, afterLog, contractAddress, tag, nodeUrl, follow, log });
      },
    );

  program
    .command('block-number')
    .description('Gets the current Aztec L2 block number.')
    .addOption(nodeOption)
    .action(async (options: any) => {
      const { blockNumber } = await import('./block_number.js');
      await blockNumber(options.nodeUrl, log);
    });

  program
    .command('get-node-info')
    .description('Gets the information of an Aztec node from a PXE or directly from an Aztec node.')
    .option('--json', 'Emit output as json')
    .addOption(nodeOption)
    .action(async options => {
      const { getNodeInfo } = await import('./get_node_info.js');
      await getNodeInfo(options.nodeUrl, options.json, log, logJson(log));
    });

  return program;
}
