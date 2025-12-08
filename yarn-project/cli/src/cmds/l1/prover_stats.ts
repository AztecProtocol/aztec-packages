import { retrieveL2ProofVerifiedEvents } from '@aztec/archiver';
import { createEthereumChain } from '@aztec/ethereum/chain';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { compactArray, mapValues, unique } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type LogFn, type Logger, createLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';
import { createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

import chunk from 'lodash.chunk';
import groupBy from 'lodash.groupby';
import { createPublicClient, fallback, getAbiItem, getAddress, http } from 'viem';

export async function proverStats(opts: {
  l1RpcUrls: string[];
  chainId: number;
  l1RollupAddress: string | undefined;
  nodeUrl: string | undefined;
  log: LogFn;
  startBlock: bigint;
  endBlock: bigint | undefined;
  batchSize: bigint;
  provingTimeout: bigint | undefined;
  rawLogs: boolean;
}) {
  const debugLog = createLogger('cli:prover_stats');
  const {
    startBlock,
    chainId,
    l1RpcUrls,
    l1RollupAddress,
    batchSize,
    nodeUrl,
    provingTimeout,
    endBlock,
    rawLogs,
    log,
  } = opts;
  if (!l1RollupAddress && !nodeUrl) {
    throw new Error('Either L1 rollup address or node URL must be set');
  }

  const rollup = l1RollupAddress
    ? EthAddress.fromString(l1RollupAddress)
    : await createAztecNodeClient(nodeUrl!)
        .getL1ContractAddresses()
        .then(a => a.rollupAddress);

  const chain = createEthereumChain(l1RpcUrls, chainId).chainInfo;
  const publicClient = createPublicClient({ chain, transport: fallback(l1RpcUrls.map(url => http(url))) });
  const lastBlockNum = endBlock ?? (await publicClient.getBlockNumber());
  debugLog.verbose(`Querying events on rollup at ${rollup.toString()} from ${startBlock} up to ${lastBlockNum}`);

  // Get all events for L2 proof submissions
  const events = await getL2ProofVerifiedEvents(startBlock, lastBlockNum, batchSize, debugLog, publicClient, rollup);

  // If we only care for raw logs, output them
  if (rawLogs && !provingTimeout) {
    log(`l1_block_number, checkpoint_number, prover_id, tx_hash`);
    for (const event of events) {
      const { l1BlockNumber, checkpointNumber, proverId, txHash } = event;
      log(`${l1BlockNumber}, ${checkpointNumber}, ${proverId}, ${txHash}`);
    }
    return;
  }

  // If we don't have a proving timeout, we can just count the number of unique checkpoints per prover
  if (!provingTimeout) {
    const stats = groupBy(events, 'proverId');
    log(`prover_id, total_checkpoints_proven`);
    for (const proverId in stats) {
      const uniqueCheckpoints = new Set(stats[proverId].map(e => e.checkpointNumber));
      log(`${proverId}, ${uniqueCheckpoints.size}`);
    }
    return;
  }

  // But if we do, fetch the events for each checkpoint submitted, so we can look up their timestamp
  const checkpointEvents = await getCheckpointProposedEvents(
    startBlock,
    lastBlockNum,
    batchSize,
    debugLog,
    publicClient,
    rollup,
  );
  debugLog.verbose(
    `First checkpoint within range is ${checkpointEvents[0]?.args.checkpointNumber} at L1 block ${checkpointEvents[0]?.blockNumber}`,
  );

  // Get the timestamps for every block on every log, both for proof and block submissions
  const l1BlockNumbers = unique([...events.map(e => e.l1BlockNumber), ...checkpointEvents.map(e => e.blockNumber)]);
  const l1BlockTimestamps: Record<string, bigint> = {};
  for (const l1Batch of chunk(l1BlockNumbers, Number(batchSize))) {
    const blocks = await Promise.all(
      l1Batch.map(blockNumber => publicClient.getBlock({ includeTransactions: false, blockNumber })),
    );
    debugLog.verbose(`Queried ${blocks.length} L1 blocks between ${l1Batch[0]} and ${l1Batch[l1Batch.length - 1]}`);
    for (const block of blocks) {
      l1BlockTimestamps[block.number.toString()] = block.timestamp;
    }
  }

  // Map from checkpoint number to the l1 block in which it was submitted
  const checkpointSubmissions: Record<string, bigint> = {};
  for (const checkpointEvent of checkpointEvents) {
    checkpointSubmissions[checkpointEvent.args.checkpointNumber!.toString()] = checkpointEvent.blockNumber;
  }

  // If we want raw logs, output them
  if (rawLogs) {
    log(`l1_block_number, checkpoint_number, checkpoint_submission_timestamp, proof_timestamp, prover_id, tx_hash`);
    for (const event of events) {
      const { l1BlockNumber, checkpointNumber, proverId, txHash } = event;
      const uploadedBlockNumber = checkpointSubmissions[checkpointNumber.toString()];
      if (!uploadedBlockNumber) {
        continue;
      }
      const uploadedTimestamp = l1BlockTimestamps[uploadedBlockNumber.toString()];
      const provenTimestamp = l1BlockTimestamps[l1BlockNumber.toString()];
      log(`${l1BlockNumber}, ${checkpointNumber}, ${uploadedTimestamp}, ${provenTimestamp}, ${proverId}, ${txHash}`);
    }
    return;
  }

  // Or calculate stats per prover
  const stats = mapValues(groupBy(events, 'proverId'), (checkpoints, proverId) =>
    compactArray(
      checkpoints.map(e => {
        const provenTimestamp = l1BlockTimestamps[e.l1BlockNumber.toString()];
        const uploadedBlockNumber = checkpointSubmissions[e.checkpointNumber.toString()];
        if (!uploadedBlockNumber) {
          debugLog.verbose(
            `Skipping ${proverId}'s proof for checkpoint ${e.checkpointNumber} as it was before the start block`,
          );
          return undefined;
        }
        const uploadedTimestamp = l1BlockTimestamps[uploadedBlockNumber.toString()];
        const provingTime = provenTimestamp - uploadedTimestamp;
        debugLog.debug(
          `prover=${e.proverId} checkpointNumber=${e.checkpointNumber} uploaded=${uploadedTimestamp} proven=${provenTimestamp} time=${provingTime}`,
        );
        return { provenTimestamp, uploadedTimestamp, provingTime, ...e };
      }),
    ),
  );

  log(`prover_id, blocks_proven_within_timeout, total_blocks_proven, avg_proving_time`);
  for (const proverId in stats) {
    const blocks = stats[proverId];
    const withinTimeout = blocks.filter(b => b.provingTime <= provingTimeout);
    const uniqueBlocksWithinTimeout = new Set(withinTimeout.map(e => e.checkpointNumber));
    const uniqueBlocks = new Set(blocks.map(e => e.checkpointNumber));
    const avgProvingTime =
      blocks.length === 0 ? 0 : Math.ceil(Number(blocks.reduce((acc, b) => acc + b.provingTime, 0n)) / blocks.length);

    log(`${proverId}, ${uniqueBlocksWithinTimeout.size}, ${uniqueBlocks.size}, ${avgProvingTime}`);
  }
  return;
}

async function getL2ProofVerifiedEvents(
  startBlock: bigint,
  lastBlockNum: bigint,
  batchSize: bigint,
  debugLog: Logger,
  publicClient: ViemPublicClient,
  rollup: EthAddress,
) {
  let blockNum = startBlock;
  const events = [];
  while (blockNum <= lastBlockNum) {
    const end = blockNum + batchSize > lastBlockNum + 1n ? lastBlockNum + 1n : blockNum + batchSize;
    const newEvents = await retrieveL2ProofVerifiedEvents(publicClient, rollup, blockNum, end);
    events.push(...newEvents);
    debugLog.verbose(`Got ${newEvents.length} events querying l2 proof verified from block ${blockNum} to ${end}`);
    blockNum += batchSize;
  }
  return events;
}

async function getCheckpointProposedEvents(
  startBlock: bigint,
  lastBlockNum: bigint,
  batchSize: bigint,
  debugLog: Logger,
  publicClient: ViemPublicClient,
  rollup: EthAddress,
) {
  let blockNum = startBlock;
  const events = [];
  while (blockNum <= lastBlockNum) {
    const end = blockNum + batchSize > lastBlockNum + 1n ? lastBlockNum + 1n : blockNum + batchSize;

    const newEvents = await publicClient.getLogs({
      address: getAddress(rollup.toString()),
      event: getAbiItem({
        abi: RollupAbi,
        name: 'CheckpointProposed',
      }),
      fromBlock: blockNum,
      toBlock: end,
    });

    events.push(...newEvents);
    debugLog.verbose(`Got ${newEvents.length} events querying checkpoints submitted from block ${blockNum} to ${end}`);
    blockNum += batchSize;
  }
  return events;
}
