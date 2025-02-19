import { Fr } from '@aztec/circuits.js';
import { type LogFn, type Logger } from '@aztec/foundation/log';

import { type Command } from 'commander';

import {
  logJson,
  makePxeOption,
  parseAztecAddress,
  parseEthereumAddress,
  parseField,
  parseFieldFromHexString,
  parseOptionalAztecAddress,
  parseOptionalInteger,
  parseOptionalLogId,
  parseOptionalTxHash,
  parsePublicKey,
  pxeOption,
} from '../../utils/commands.js';

export function injectCommands(program: Command, log: LogFn, debugLogger: Logger) {
  program
    .command('add-contract')
    .description(
      'Adds an existing contract to the PXE. This is useful if you have deployed a contract outside of the PXE and want to use it with the PXE.',
    )
    .requiredOption(
      '-c, --contract-artifact <fileLocation>',
      "A compiled Aztec.nr contract's ABI in JSON format or name of a contract ABI exported by @aztec/noir-contracts.js",
    )
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', parseAztecAddress)
    .requiredOption('--init-hash <init hash>', 'Initialization hash', parseFieldFromHexString)
    .option('--salt <salt>', 'Optional deployment salt', parseFieldFromHexString)
    .option('-p, --public-key <public key>', 'Optional public key for this contract', parsePublicKey)
    .option('--portal-address <address>', 'Optional address to a portal contract on L1', parseEthereumAddress)
    .option('--deployer-address <address>', 'Optional address of the contract deployer', parseAztecAddress)
    .addOption(pxeOption)
    .action(async options => {
      const { addContract } = await import('./add_contract.js');
      await addContract(
        options.rpcUrl,
        options.contractArtifact,
        options.contractAddress,
        options.initHash,
        options.salt ?? Fr.ZERO,
        options.publicKey,
        options.deployerAddress,
        debugLogger,
        log,
      );
    });

  program
    .command('get-block')
    .description('Gets info for a given block or latest.')
    .argument('[blockNumber]', 'Block height', parseOptionalInteger)
    .addOption(pxeOption)
    .action(async (blockNumber, options) => {
      const { getBlock } = await import('./get_block.js');
      await getBlock(options.rpcUrl, blockNumber, debugLogger, log);
    });

  program
    .command('get-current-base-fee')
    .description('Gets the current base fee.')
    .addOption(pxeOption)
    .action(async options => {
      const { getCurrentBaseFee } = await import('./get_current_base_fee.js');
      await getCurrentBaseFee(options.rpcUrl, debugLogger, log);
    });

  program
    .command('get-contract-data')
    .description('Gets information about the Aztec contract deployed at the specified address.')
    .argument('<contractAddress>', 'Aztec address of the contract.', parseAztecAddress)
    .addOption(pxeOption)
    .option('-b, --include-bytecode <boolean>', "Include the contract's public function bytecode, if any.", false)
    .action(async (contractAddress, options) => {
      const { getContractData } = await import('./get_contract_data.js');
      await getContractData(options.rpcUrl, contractAddress, options.includeBytecode, debugLogger, log);
    });

  program
    .command('get-logs')
    .description('Gets all the public logs from an intersection of all the filter params.')
    .option('-tx, --tx-hash <txHash>', 'A transaction hash to get the receipt for.', parseOptionalTxHash)
    .option(
      '-fb, --from-block <blockNum>',
      'Initial block number for getting logs (defaults to 1).',
      parseOptionalInteger,
    )
    .option('-tb, --to-block <blockNum>', 'Up to which block to fetch logs (defaults to latest).', parseOptionalInteger)
    .option('-al --after-log <logId>', 'ID of a log after which to fetch the logs.', parseOptionalLogId)
    .option('-ca, --contract-address <address>', 'Contract address to filter logs by.', parseOptionalAztecAddress)
    .addOption(pxeOption)
    .option('--follow', 'If set, will keep polling for new logs until interrupted.')
    .action(async ({ txHash, fromBlock, toBlock, afterLog, contractAddress, rpcUrl, follow }) => {
      const { getLogs } = await import('./get_logs.js');
      await getLogs(txHash, fromBlock, toBlock, afterLog, contractAddress, rpcUrl, follow, debugLogger, log);
    });

  program
    .command('get-accounts')
    .description('Gets all the Aztec accounts stored in the PXE.')
    .addOption(pxeOption)
    .option('--json', 'Emit output as json')
    .action(async (options: any) => {
      const { getAccounts } = await import('./get_accounts.js');
      await getAccounts(options.rpcUrl, options.json, debugLogger, log, logJson(log));
    });

  program
    .command('get-account')
    .description('Gets an account given its Aztec address.')
    .argument('<address>', 'The Aztec address to get account for', parseAztecAddress)
    .addOption(pxeOption)
    .action(async (address, options) => {
      const { getAccount } = await import('./get_account.js');
      await getAccount(address, options.rpcUrl, debugLogger, log);
    });

  program
    .command('block-number')
    .description('Gets the current Aztec L2 block number.')
    .addOption(pxeOption)
    .action(async (options: any) => {
      const { blockNumber } = await import('./block_number.js');
      await blockNumber(options.rpcUrl, debugLogger, log);
    });

  program
    .command('get-l1-to-l2-message-witness')
    .description('Gets a L1 to L2 message witness.')
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', parseAztecAddress)
    .requiredOption('--message-hash <messageHash>', 'The L1 to L2 message hash.', parseField)
    .requiredOption('--secret <secret>', 'The secret used to claim the L1 to L2 message', parseField)
    .addOption(pxeOption)
    .action(async ({ contractAddress, messageHash, secret, rpcUrl }) => {
      const { getL1ToL2MessageWitness } = await import('./get_l1_to_l2_message_witness.js');
      await getL1ToL2MessageWitness(rpcUrl, contractAddress, messageHash, secret, debugLogger, log);
    });

  program
    .command('get-node-info')
    .description('Gets the information of an Aztec node from a PXE or directly from an Aztec node.')
    .option('--node-url <string>', 'URL of the node.')
    .option('--json', 'Emit output as json')
    .addOption(makePxeOption(false))
    .action(async options => {
      const { getNodeInfo } = await import('./get_node_info.js');
      let url: string;
      if (options.nodeUrl) {
        url = options.nodeUrl;
      } else {
        url = options.rpcUrl;
      }
      await getNodeInfo(url, !options.nodeUrl, debugLogger, options.json, log, logJson(log));
    });

  program
    .command('get-pxe-info')
    .description('Gets the information of a PXE at a URL.')
    .addOption(pxeOption)
    .action(async options => {
      const { getPXEInfo } = await import('./get_pxe_info.js');
      await getPXEInfo(options.rpcUrl, debugLogger, log);
    });

  return program;
}
