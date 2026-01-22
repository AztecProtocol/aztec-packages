#!/usr/bin/env node
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';

import { type Hex, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { CalldataRetriever } from '../calldata_retriever.js';

const logger = createLogger('archiver:calldata-test');

interface ScriptArgs {
  rollupAddress: EthAddress;
  txHash: Hex;
  rpcUrl: string;
  targetCommitteeSize: number;
}

function parseArgs(): ScriptArgs {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    // eslint-disable-next-line no-console
    console.error('Usage: node index.js <rollup-address> <tx-hash> [target-committee-size]');
    // eslint-disable-next-line no-console
    console.error('');
    // eslint-disable-next-line no-console
    console.error('Environment variables:');
    // eslint-disable-next-line no-console
    console.error('  ETHEREUM_HOST or RPC_URL - Ethereum RPC endpoint');
    // eslint-disable-next-line no-console
    console.error('');
    // eslint-disable-next-line no-console
    console.error('Example:');
    // eslint-disable-next-line no-console
    console.error('  RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY \\');
    // eslint-disable-next-line no-console
    console.error('  node index.js 0x1234... 0xabcd... 32');
    process.exit(1);
  }

  const rollupAddress = EthAddress.fromString(args[0]);
  const txHash = args[1] as Hex;
  const targetCommitteeSize = args[2] ? parseInt(args[2], 10) : 24;

  const rpcUrl = process.env.ETHEREUM_HOST || process.env.RPC_URL;
  if (!rpcUrl) {
    // eslint-disable-next-line no-console
    console.error('Error: ETHEREUM_HOST or RPC_URL environment variable must be set');
    process.exit(1);
  }

  if (targetCommitteeSize <= 0 || targetCommitteeSize > 256) {
    // eslint-disable-next-line no-console
    console.error('Error: target-committee-size must be between 1 and 256');
    process.exit(1);
  }

  return { rollupAddress, txHash, rpcUrl, targetCommitteeSize };
}

async function main() {
  const { rollupAddress, txHash, rpcUrl, targetCommitteeSize } = parseArgs();

  logger.info('Calldata Retriever Test Script');
  logger.info('===============================');
  logger.info(`Rollup Address: ${rollupAddress.toString()}`);
  logger.info(`Transaction Hash: ${txHash}`);
  logger.info(`RPC URL: ${rpcUrl}`);
  logger.info(`Target Committee Size: ${targetCommitteeSize}`);
  logger.info('');

  try {
    // Create viem public client
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl, { batch: false }),
    });

    logger.info('Fetching transaction...');
    const tx = await publicClient.getTransaction({ hash: txHash });

    if (!tx) {
      throw new Error(`Transaction ${txHash} not found`);
    }

    logger.info(`Transaction found in block ${tx.blockNumber}`);

    // For simplicity, use zero addresses for optional contract addresses
    // In production, these would be fetched from the rollup contract or configuration
    const slashingProposerAddress = EthAddress.ZERO;
    const governanceProposerAddress = EthAddress.ZERO;
    const slashFactoryAddress = undefined;

    logger.info('Using zero addresses for governance/slashing (can be configured if needed)');

    // Create CalldataRetriever
    const retriever = new CalldataRetriever(
      publicClient as unknown as ViemPublicClient,
      publicClient as unknown as ViemPublicDebugClient,
      targetCommitteeSize,
      undefined,
      logger,
      {
        rollupAddress,
        governanceProposerAddress,
        slashingProposerAddress,
        slashFactoryAddress,
      },
    );

    // Extract L2 block number from transaction logs
    logger.info('Decoding transaction to extract L2 block number...');
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    const l2BlockProposedEvent = receipt.logs.find(log => {
      try {
        // Try to match the L2BlockProposed event
        return (
          log.address.toLowerCase() === rollupAddress.toString().toLowerCase() &&
          log.topics[0] === '0x2f1d0e696fa5186494a2f2f89a0e0bcbb15d607f6c5eac4637e07e1e5e7d3c00' // L2BlockProposed event signature
        );
      } catch {
        return false;
      }
    });

    let l2BlockNumber: number;
    if (l2BlockProposedEvent && l2BlockProposedEvent.topics[1]) {
      // L2 block number is typically the first indexed parameter
      l2BlockNumber = Number(BigInt(l2BlockProposedEvent.topics[1]));
      logger.info(`L2 Block Number (from event): ${l2BlockNumber}`);
    } else {
      // Fallback: try to extract from transaction data or use a default
      logger.warn('Could not extract L2 block number from event, using block number as fallback');
      l2BlockNumber = Number(tx.blockNumber);
    }

    logger.info('');
    logger.info('Retrieving block header from rollup transaction...');
    logger.info('');

    // For this script, we don't have blob hashes or expected hashes, so pass empty arrays/objects
    const result = await retriever.getCheckpointFromRollupTx(
      txHash,
      [],
      CheckpointNumber.fromBlockNumber(BlockNumber(l2BlockNumber)),
      {},
    );

    logger.info(' Successfully retrieved block header!');
    logger.info('');
    logger.info('Block Header Details:');
    logger.info('====================');
    logger.info(`Checkpoint Number: ${result.checkpointNumber}`);
    logger.info(`Block Hash: ${result.blockHash}`);
    logger.info(`Archive Root: ${result.archiveRoot.toString()}`);
    logger.info('');
    logger.info('Header:');
    logger.info(`  Slot Number: ${result.header.slotNumber.toString()}`);
    logger.info(`  Timestamp: ${result.header.timestamp.toString()}`);
    logger.info(`  Coinbase: ${result.header.coinbase.toString()}`);
    logger.info(`  Fee Recipient: ${result.header.feeRecipient.toString()}`);
    logger.info(`  Total Mana Used: ${result.header.totalManaUsed.toString()}`);
    logger.info('');
    logger.info('Attestations:');
    logger.info(`  Count: ${result.attestations.length}`);
    logger.info(`  Non-empty attestations: ${result.attestations.filter((a: any) => !a.signature.isEmpty()).length}`);

    process.exit(0);
  } catch (error) {
    logger.error('Error retrieving block header:');
    logger.error(error instanceof Error ? error.message : String(error));

    if (error instanceof Error && error.stack) {
      logger.debug(error.stack);
    }

    process.exit(1);
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
