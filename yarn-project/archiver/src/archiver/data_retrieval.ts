import { Body, ExtendedContractData, L1ToL2Message } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, Fr, Header } from '@aztec/circuits.js';
import { EthAddress } from '@aztec/foundation/eth-address';

import { PublicClient } from 'viem';

import {
  getContractDeploymentLogs,
  getL1ToL2MessageCancelledLogs,
  getL2BlockProcessedLogs,
  getL2TxsPublishedLogs,
  getPendingL1ToL2MessageLogs,
  processBlockBodyLogs,
  processBlockLogs,
  processCancelledL1ToL2MessagesLogs,
  processContractDeploymentLogs,
  processPendingL1ToL2MessageAddedLogs,
} from './eth_log_handlers.js';

/**
 * Data retrieved from logs
 */
export type DataRetrieval<T> = {
  /**
   * The next block number.
   */
  nextEthBlockNumber: bigint;
  /**
   * The data returned.
   */
  retrievedData: T[];
};

/**
 * Fetches new L2 Blocks.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param rollupAddress - The address of the rollup contract.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param expectedNextL2BlockNum - The next L2 block number that we expect to find.
 * @returns An array of L2 Blocks and the next eth block to search from
 */
export async function retrieveBlockHashesFromRollup(
  publicClient: PublicClient,
  rollupAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  expectedNextL2BlockNum: bigint,
): Promise<DataRetrieval<[Header, AppendOnlyTreeSnapshot, bigint]>> {
  const retrievedBlockMetadata: [Header, AppendOnlyTreeSnapshot, bigint][] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const l2BlockProcessedLogs = await getL2BlockProcessedLogs(
      publicClient,
      rollupAddress,
      searchStartBlock,
      searchEndBlock,
    );
    if (l2BlockProcessedLogs.length === 0) {
      break;
    }

    const newBlockMetadata = await processBlockLogs(publicClient, expectedNextL2BlockNum, l2BlockProcessedLogs);
    retrievedBlockMetadata.push(...newBlockMetadata);
    searchStartBlock = l2BlockProcessedLogs[l2BlockProcessedLogs.length - 1].blockNumber! + 1n;
    expectedNextL2BlockNum += BigInt(newBlockMetadata.length);
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { nextEthBlockNumber: searchStartBlock, retrievedData: retrievedBlockMetadata };
}

/**
 * Fetches new L2 Blocks.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param dataAvailabilityAddress - The address of the rollup contract.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param expectedNextL2BlockNum - The next L2 block number that we expect to find.
 * @returns An array of L2 Blocks and the next eth block to search from
 */
export async function retrieveBlockBodiesFromDataAvailability(
  publicClient: PublicClient,
  dataAvailabilityAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<[Body, Buffer]>> {
  const retrievedBlockBodies: [Body, Buffer][] = [];

  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const l2TxsPublishedLogs = await getL2TxsPublishedLogs(
      publicClient,
      dataAvailabilityAddress,
      searchStartBlock,
      searchEndBlock,
    );
    if (l2TxsPublishedLogs.length === 0) {
      break;
    }

    const newBlockBodies = await processBlockBodyLogs(publicClient, l2TxsPublishedLogs);
    retrievedBlockBodies.push(...newBlockBodies);
    searchStartBlock = l2TxsPublishedLogs[l2TxsPublishedLogs.length - 1].blockNumber! + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { nextEthBlockNumber: searchStartBlock, retrievedData: retrievedBlockBodies };
}

/**
 * Fetches new contract data.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param contractDeploymentEmitterAddress - The address of the contract deployment emitter contract.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param blockNumberToBodyHash - A mapping from block number to relevant body hash.
 * @returns An array of ExtendedContractData and their equivalent L2 Block number along with the next eth block to search from..
 */
export async function retrieveNewContractData(
  publicClient: PublicClient,
  contractDeploymentEmitterAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  blockNumberToBodyHash: { [key: number]: Buffer | undefined },
): Promise<DataRetrieval<[ExtendedContractData[], number]>> {
  let retrievedNewContracts: [ExtendedContractData[], number][] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const contractDataLogs = await getContractDeploymentLogs(
      publicClient,
      contractDeploymentEmitterAddress,
      searchStartBlock,
      searchEndBlock,
    );
    if (contractDataLogs.length === 0) {
      break;
    }
    const newContracts = processContractDeploymentLogs(blockNumberToBodyHash, contractDataLogs);
    retrievedNewContracts = retrievedNewContracts.concat(newContracts);
    searchStartBlock = (contractDataLogs.findLast(cd => !!cd)?.blockNumber || searchStartBlock) + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { nextEthBlockNumber: searchStartBlock, retrievedData: retrievedNewContracts };
}

/**
 * Fetch new pending L1 to L2 messages.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param inboxAddress - The address of the inbox contract to fetch messages from.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @returns An array of L1ToL2Message and next eth block to search from.
 */
export async function retrieveNewPendingL1ToL2Messages(
  publicClient: PublicClient,
  inboxAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<[L1ToL2Message, bigint]>> {
  const retrievedNewL1ToL2Messages: [L1ToL2Message, bigint][] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const newL1ToL2MessageLogs = await getPendingL1ToL2MessageLogs(
      publicClient,
      inboxAddress,
      searchStartBlock,
      searchEndBlock,
    );
    if (newL1ToL2MessageLogs.length === 0) {
      break;
    }
    const newL1ToL2Messages = processPendingL1ToL2MessageAddedLogs(newL1ToL2MessageLogs);
    retrievedNewL1ToL2Messages.push(...newL1ToL2Messages);
    // handles the case when there are no new messages:
    searchStartBlock = (newL1ToL2MessageLogs.findLast(msgLog => !!msgLog)?.blockNumber || searchStartBlock) + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { nextEthBlockNumber: searchStartBlock, retrievedData: retrievedNewL1ToL2Messages };
}

/**
 * Fetch newly cancelled L1 to L2 messages.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param inboxAddress - The address of the inbox contract to fetch messages from.
 * @param blockUntilSynced - If true, blocks until the archiver has fully synced.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @returns An array of message keys that were cancelled and next eth block to search from.
 */
export async function retrieveNewCancelledL1ToL2Messages(
  publicClient: PublicClient,
  inboxAddress: EthAddress,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<[Fr, bigint]>> {
  const retrievedNewCancelledL1ToL2Messages: [Fr, bigint][] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const newL1ToL2MessageCancelledLogs = await getL1ToL2MessageCancelledLogs(
      publicClient,
      inboxAddress,
      searchStartBlock,
      searchEndBlock,
    );
    if (newL1ToL2MessageCancelledLogs.length === 0) {
      break;
    }
    const newCancelledL1ToL2Messages = processCancelledL1ToL2MessagesLogs(newL1ToL2MessageCancelledLogs);
    retrievedNewCancelledL1ToL2Messages.push(...newCancelledL1ToL2Messages);
    // handles the case when there are no new messages:
    searchStartBlock =
      (newL1ToL2MessageCancelledLogs.findLast(msgLog => !!msgLog)?.blockNumber || searchStartBlock) + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return { nextEthBlockNumber: searchStartBlock, retrievedData: retrievedNewCancelledL1ToL2Messages };
}
