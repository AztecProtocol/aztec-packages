import { type InboxLeaf, type L2Block } from '@aztec/circuit-types';
import { Fr, type Proof } from '@aztec/circuits.js';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  getAbiItem,
} from 'viem';

import {
  getBlockProofFromSubmitProofTx,
  getL2BlockProposedLogs,
  getMessageSentLogs,
  processL2BlockProposedLogs,
  processMessageSentLogs,
} from './eth_log_handlers.js';
import { type DataRetrieval } from './structs/data_retrieval.js';
import { type L1Published } from './structs/published.js';

/**
 * Fetches new L2 blocks.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param rollupAddress - The address of the rollup contract.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param expectedNextL2BlockNum - The next L2 block number that we expect to find.
 * @returns An array of block; as well as the next eth block to search from.
 */
export async function retrieveBlockFromRollup(
  rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>,
  publicClient: PublicClient,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  logger: DebugLogger = createDebugLogger('aztec:archiver'),
): Promise<L1Published<L2Block>[]> {
  const retrievedBlocks: L1Published<L2Block>[] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const l2BlockProposedLogs = await getL2BlockProposedLogs(
      publicClient,
      EthAddress.fromString(rollup.address),
      searchStartBlock,
      searchEndBlock,
    );

    if (l2BlockProposedLogs.length === 0) {
      break;
    }

    const lastLog = l2BlockProposedLogs[l2BlockProposedLogs.length - 1];
    logger.debug(
      `Got L2 block processed logs for ${l2BlockProposedLogs[0].blockNumber}-${lastLog.blockNumber} between ${searchStartBlock}-${searchEndBlock} L1 blocks`,
    );

    const newBlocks = await processL2BlockProposedLogs(rollup, publicClient, l2BlockProposedLogs);
    retrievedBlocks.push(...newBlocks);
    searchStartBlock = lastLog.blockNumber! + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return retrievedBlocks;
}

/**
 * Fetch L1 to L2 messages.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param inboxAddress - The address of the inbox contract to fetch messages from.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @returns An array of InboxLeaf and next eth block to search from.
 */
export async function retrieveL1ToL2Messages(
  publicClient: PublicClient,
  inboxAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<InboxLeaf>> {
  const retrievedL1ToL2Messages: InboxLeaf[] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const messageSentLogs = await getMessageSentLogs(publicClient, inboxAddress, searchStartBlock, searchEndBlock);
    if (messageSentLogs.length === 0) {
      break;
    }
    const l1ToL2Messages = processMessageSentLogs(messageSentLogs);
    retrievedL1ToL2Messages.push(...l1ToL2Messages);
    // handles the case when there are no new messages:
    searchStartBlock = (messageSentLogs.findLast(msgLog => !!msgLog)?.blockNumber || searchStartBlock) + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { lastProcessedL1BlockNumber: searchStartBlock - 1n, retrievedData: retrievedL1ToL2Messages };
}

/** Retrieves L2ProofVerified events from the rollup contract. */
export async function retrieveL2ProofVerifiedEvents(
  publicClient: PublicClient,
  rollupAddress: EthAddress,
  searchStartBlock: bigint,
  searchEndBlock?: bigint,
): Promise<{ l1BlockNumber: bigint; l2BlockNumber: bigint; proverId: Fr; txHash: Hex }[]> {
  const logs = await publicClient.getLogs({
    address: rollupAddress.toString(),
    fromBlock: searchStartBlock,
    toBlock: searchEndBlock ? searchEndBlock + 1n : undefined,
    strict: true,
    event: getAbiItem({ abi: RollupAbi, name: 'L2ProofVerified' }),
  });

  return logs.map(log => ({
    l1BlockNumber: log.blockNumber,
    l2BlockNumber: log.args.blockNumber,
    proverId: Fr.fromString(log.args.proverId),
    txHash: log.transactionHash,
  }));
}

/** Retrieve submitted proofs from the rollup contract */
export async function retrieveL2ProofsFromRollup(
  publicClient: PublicClient,
  rollupAddress: EthAddress,
  searchStartBlock: bigint,
  searchEndBlock?: bigint,
): Promise<DataRetrieval<{ proof: Proof; proverId: Fr; l2BlockNumber: bigint; txHash: `0x${string}` }>> {
  const logs = await retrieveL2ProofVerifiedEvents(publicClient, rollupAddress, searchStartBlock, searchEndBlock);
  const retrievedData: { proof: Proof; proverId: Fr; l2BlockNumber: bigint; txHash: `0x${string}` }[] = [];
  const lastProcessedL1BlockNumber = logs.length > 0 ? logs.at(-1)!.l1BlockNumber : searchStartBlock - 1n;

  for (const { txHash, proverId, l2BlockNumber } of logs) {
    const proofData = await getBlockProofFromSubmitProofTx(publicClient, txHash, l2BlockNumber, proverId);
    retrievedData.push({ proof: proofData.proof, proverId: proofData.proverId, l2BlockNumber, txHash });
  }
  return {
    retrievedData,
    lastProcessedL1BlockNumber,
  };
}
