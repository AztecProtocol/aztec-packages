import { type Body, type InboxLeaf } from '@aztec/circuit-types';
import { type AppendOnlyTreeSnapshot, Fr, type Header, type Proof } from '@aztec/circuits.js';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { RollupAbi } from '@aztec/l1-artifacts';

import { type Hex, type PublicClient, getAbiItem } from 'viem';

import {
  getBlockProofFromSubmitProofTx,
  getL2BlockProposedLogs,
  getMessageSentLogs,
  getTxsPublishedLogs,
  processL2BlockProposedLogs,
  processMessageSentLogs,
  processTxsPublishedLogs,
} from './eth_log_handlers.js';
import { type DataRetrieval } from './structs/data_retrieval.js';
import { type L1PublishedData } from './structs/published.js';

/**
 * Fetches new L2 block metadata (header, archive snapshot).
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param rollupAddress - The address of the rollup contract.
 * @param startBlock - The block number to use for starting the search.
 * @param endBlock - The highest block number that we should search up to.
 * @param expectedNextL2BlockNum - The next L2 block number that we expect to find.
 * @returns An array of tuples representing block metadata including the header, archive tree snapshot; as well as the next eth block to search from.
 */
export async function retrieveBlockMetadataFromRollup(
  publicClient: PublicClient,
  rollupAddress: EthAddress,
  startBlock: bigint,
  endBlock: bigint,
  expectedNextL2BlockNum: bigint,
  logger: DebugLogger = createDebugLogger('aztec:archiver'),
): Promise<[Header, AppendOnlyTreeSnapshot, L1PublishedData][]> {
  const { retrievedData } = await batchedRead(
    publicClient,
    { startBlock, endBlock },
    async (client, startBlock, endBlock) => {
      const L2BlockProposedLogs = await getL2BlockProposedLogs(client, rollupAddress, startBlock, endBlock);
      if (L2BlockProposedLogs.length === 0) {
        logger.debug(`No L2 block processed logs found between ${startBlock}-${endBlock} L1 blocks`);
        return [];
      }
      const lastLog = L2BlockProposedLogs[L2BlockProposedLogs.length - 1];
      logger.debug(
        `Got L2 block processed logs for ${L2BlockProposedLogs[0].blockNumber}-${lastLog.blockNumber} between ${startBlock}-${endBlock} L1 blocks`,
      );
      const newBlockMetadata = await processL2BlockProposedLogs(
        publicClient,
        expectedNextL2BlockNum,
        L2BlockProposedLogs,
      );
      expectedNextL2BlockNum += BigInt(newBlockMetadata.length);

      return newBlockMetadata;
    },
  );

  return retrievedData;
}

/**
 * Fetches new L2 block bodies and their hashes.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param availabilityOracleAddress - The address of the availability oracle contract.
 * @param startBlock - The block number to use for starting the search.
 * @param endBlock - The highest block number that we should search up to.
 * @returns A array of L2 block bodies as well as the next eth block to search from
 */
export function retrieveBlockBodiesFromAvailabilityOracle(
  publicClient: PublicClient,
  availabilityOracleAddress: EthAddress,
  startBlock: bigint,
  endBlock: bigint,
): Promise<DataRetrieval<Body>> {
  return batchedRead(publicClient, { startBlock, endBlock }, async (client, startBlock, endBlock) => {
    const l2TxsPublishedLogs = await getTxsPublishedLogs(client, availabilityOracleAddress, startBlock, endBlock);
    const logs = await processTxsPublishedLogs(publicClient, l2TxsPublishedLogs);
    return logs.map(([body]) => body);
  });
}

/**
 * Fetch L1 to L2 messages.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param inboxAddress - The address of the inbox contract to fetch messages from.
 * @param startBlock - The block number to use for starting the search.
 * @param endBlock - The highest block number that we should search up to.
 * @returns An array of InboxLeaf and next eth block to search from.
 */
export function retrieveL1ToL2Messages(
  publicClient: PublicClient,
  inboxAddress: EthAddress,
  startBlock: bigint,
  endBlock: bigint,
): Promise<DataRetrieval<InboxLeaf>> {
  return batchedRead(publicClient, { startBlock, endBlock }, async (publicClient, startBlock, endBlock) => {
    const messageSentLogs = await getMessageSentLogs(publicClient, inboxAddress, startBlock, endBlock);
    return processMessageSentLogs(messageSentLogs);
  });
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

type ReadFn<T> = (client: PublicClient, startBlock: bigint, endBlock: bigint) => Promise<T[]>;
type BatchReadOpts = {
  /** The start block of the range */
  startBlock: bigint;
  /** Optional. The end block of the range. If missing will read up to the current tip of the chain */
  endBlock?: bigint;
  /** Optional. The batch size */
  batchSize?: bigint;
};

/**
 * Repeatedly calls the provided read function to retrieve data from L1
 * @param publicClient - The client used to read from the chain
 * @param opts - The block range to read
 * @param fn - The function to read from the chain
 */
export async function batchedRead<T>(
  publicClient: PublicClient,
  { startBlock, endBlock, batchSize = 100n }: BatchReadOpts,
  fn: ReadFn<T>,
): Promise<DataRetrieval<T>> {
  endBlock ??= await publicClient.getBlockNumber();
  const retrievedData: T[] = [];

  while (startBlock < endBlock) {
    const batchEndBlock = startBlock + batchSize;
    // make sure we're not going to read beyond the requested interval
    const min = endBlock - 1n < batchEndBlock ? endBlock : batchEndBlock;
    retrievedData.push(...(await fn(publicClient, startBlock, min)));
    startBlock = min + 1n;
  }

  return { retrievedData, lastProcessedL1BlockNumber: endBlock };
}
