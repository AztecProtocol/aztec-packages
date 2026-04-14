#!/usr/bin/env node
import type { ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts/RollupAbi';

import { type Hex, createPublicClient, decodeEventLog, getAbiItem, http, toEventSelector } from 'viem';
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

    // Create CalldataRetriever
    const retriever = new CalldataRetriever(
      publicClient as unknown as ViemPublicClient,
      publicClient as unknown as ViemPublicDebugClient,
      targetCommitteeSize,
      undefined,
      logger,
      rollupAddress,
    );

    // Extract checkpoint number and hashes from transaction logs
    logger.info('Decoding transaction to extract checkpoint number and hashes...');
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

    // Look for CheckpointProposed event
    const checkpointProposedEventAbi = getAbiItem({ abi: RollupAbi, name: 'CheckpointProposed' });
    const checkpointProposedLog = receipt.logs.find(log => {
      try {
        return (
          log.address.toLowerCase() === rollupAddress.toString().toLowerCase() &&
          log.topics[0] === toEventSelector(checkpointProposedEventAbi)
        );
      } catch {
        return false;
      }
    });

    if (!checkpointProposedLog || checkpointProposedLog.topics[1] === undefined) {
      throw new Error(`Checkpoint proposed event not found`);
    }

    const checkpointNumber = CheckpointNumber.fromBigInt(BigInt(checkpointProposedLog.topics[1]));

    // Decode the full event to extract attestationsHash and payloadDigest
    const decodedEvent = decodeEventLog({
      abi: RollupAbi,
      data: checkpointProposedLog.data,
      topics: checkpointProposedLog.topics,
    });

    const eventArgs = decodedEvent.args as {
      checkpointNumber: bigint;
      archive: Hex;
      versionedBlobHashes: Hex[];
      attestationsHash: Hex;
      payloadDigest: Hex;
    };

    if (!eventArgs.attestationsHash || !eventArgs.payloadDigest) {
      throw new Error(`CheckpointProposed event missing attestationsHash or payloadDigest`);
    }

    const expectedHashes = {
      attestationsHash: eventArgs.attestationsHash,
      payloadDigest: eventArgs.payloadDigest,
    };

    logger.info(`Checkpoint Number: ${checkpointNumber}`);
    logger.info(`Attestations Hash: ${expectedHashes.attestationsHash}`);
    logger.info(`Payload Digest: ${expectedHashes.payloadDigest}`);

    logger.info('');
    logger.info('Retrieving checkpoint from rollup transaction...');
    logger.info('');

    const result = await retriever.getCheckpointFromRollupTx(txHash, [], checkpointNumber, expectedHashes);

    logger.info(' Successfully retrieved block header!');
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
