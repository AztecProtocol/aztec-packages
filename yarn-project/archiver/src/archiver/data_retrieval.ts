import { Body, InboxLeaf, L2Block } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, Fr, Header, Proof } from '@aztec/circuits.js';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type ViemSignature } from '@aztec/foundation/eth-signature';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { numToUInt32BE } from '@aztec/foundation/serialize';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';

import {
  type Chain,
  type GetContractEventsReturnType,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  decodeFunctionData,
  getAbiItem,
  hexToBytes,
} from 'viem';

import { type DataRetrieval } from './structs/data_retrieval.js';
import { type L1Published, type L1PublishedData } from './structs/published.js';

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
    const l2BlockProposedLogs = await rollup.getEvents.L2BlockProposed(
      {},
      {
        fromBlock: searchStartBlock,
        toBlock: searchEndBlock + 1n,
      },
    );

    if (l2BlockProposedLogs.length === 0) {
      break;
    }

    const lastLog = l2BlockProposedLogs[l2BlockProposedLogs.length - 1];
    logger.debug(
      `Got L2 block processed logs for ${l2BlockProposedLogs[0].blockNumber}-${lastLog.blockNumber} between ${searchStartBlock}-${searchEndBlock} L1 blocks`,
    );

    const newBlocks = await processL2BlockProposedLogs(rollup, publicClient, l2BlockProposedLogs, logger);
    retrievedBlocks.push(...newBlocks);
    searchStartBlock = lastLog.blockNumber! + 1n;
  } while (blockUntilSynced && searchStartBlock <= searchEndBlock);
  return retrievedBlocks;
}

/**
 * Processes newly received L2BlockProposed logs.
 * @param rollup - The rollup contract
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param logs - L2BlockProposed logs.
 * @returns - An array blocks.
 */
export async function processL2BlockProposedLogs(
  rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>,
  publicClient: PublicClient,
  logs: GetContractEventsReturnType<typeof RollupAbi, 'L2BlockProposed'>,
  logger: DebugLogger,
): Promise<L1Published<L2Block>[]> {
  const retrievedBlocks: L1Published<L2Block>[] = [];
  for (const log of logs) {
    const l2BlockNumber = log.args.blockNumber!;
    const archive = log.args.archive!;
    const archiveFromChain = await rollup.read.archiveAt([l2BlockNumber]);

    // The value from the event and contract will match only if the block is in the chain.
    if (archive === archiveFromChain) {
      // TODO: Fetch blocks from calldata in parallel
      const block = await getBlockFromRollupTx(publicClient, log.transactionHash!, l2BlockNumber);

      const l1: L1PublishedData = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        timestamp: await getL1BlockTime(publicClient, log.blockNumber),
      };

      retrievedBlocks.push({ data: block, l1 });
    } else {
      logger.warn(
        `Archive mismatch matching, ignoring block ${l2BlockNumber} with archive: ${archive}, expected ${archiveFromChain}`,
      );
    }
  }

  return retrievedBlocks;
}

export async function getL1BlockTime(publicClient: PublicClient, blockNumber: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: false });
  return block.timestamp;
}

/**
 * Gets block from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param l2BlockNum - L2 block number.
 * @returns L2 block from the calldata, deserialized
 */
async function getBlockFromRollupTx(
  publicClient: PublicClient,
  txHash: `0x${string}`,
  l2BlockNum: bigint,
): Promise<L2Block> {
  const { input: data } = await publicClient.getTransaction({ hash: txHash });
  const { functionName, args } = decodeFunctionData({
    abi: RollupAbi,
    data,
  });

  const allowedMethods = ['propose', 'proposeAndClaim'];

  if (!allowedMethods.includes(functionName)) {
    throw new Error(`Unexpected method called ${functionName}`);
  }
  const [decodedArgs, , bodyHex] = args! as readonly [
    {
      header: Hex;
      archive: Hex;
      blockHash: Hex;
      oracleInput: {
        provingCostModifier: bigint;
        feeAssetPriceModifier: bigint;
      };
      txHashes: Hex[];
    },
    ViemSignature[],
    Hex,
  ];

  const header = Header.fromBuffer(Buffer.from(hexToBytes(decodedArgs.header)));
  const blockBody = Body.fromBuffer(Buffer.from(hexToBytes(bodyHex)));

  const blockNumberFromHeader = header.globalVariables.blockNumber.toBigInt();

  if (blockNumberFromHeader !== l2BlockNum) {
    throw new Error(`Block number mismatch: expected ${l2BlockNum} but got ${blockNumberFromHeader}`);
  }

  const archive = AppendOnlyTreeSnapshot.fromBuffer(
    Buffer.concat([
      Buffer.from(hexToBytes(decodedArgs.archive)), // L2Block.archive.root
      numToUInt32BE(Number(l2BlockNum + 1n)), // L2Block.archive.nextAvailableLeafIndex
    ]),
  );

  return new L2Block(archive, header, blockBody);
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
  inbox: GetContractReturnType<typeof InboxAbi, PublicClient<HttpTransport, Chain>>,
  blockUntilSynced: boolean,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<InboxLeaf>> {
  const retrievedL1ToL2Messages: InboxLeaf[] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }

    const messageSentLogs = await inbox.getEvents.MessageSent(
      {},
      {
        fromBlock: searchStartBlock,
        toBlock: searchEndBlock + 1n,
      },
    );

    if (messageSentLogs.length === 0) {
      break;
    }

    for (const log of messageSentLogs) {
      const { index, hash } = log.args;
      retrievedL1ToL2Messages.push(new InboxLeaf(index!, Fr.fromString(hash!)));
    }

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
    const proofData = await getProofFromSubmitProofTx(publicClient, txHash, proverId);
    retrievedData.push({ proof: proofData.proof, proverId: proofData.proverId, l2BlockNumber, txHash });
  }
  return {
    retrievedData,
    lastProcessedL1BlockNumber,
  };
}

export type SubmitBlockProof = {
  archiveRoot: Fr;
  proverId: Fr;
  aggregationObject: Buffer;
  proof: Proof;
};

/**
 * Gets block metadata (header and archive snapshot) from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param l2BlockNum - L2 block number.
 * @returns L2 block metadata (header and archive) from the calldata, deserialized
 */
export async function getProofFromSubmitProofTx(
  publicClient: PublicClient,
  txHash: `0x${string}`,
  expectedProverId: Fr,
): Promise<SubmitBlockProof> {
  const { input: data } = await publicClient.getTransaction({ hash: txHash });
  const { functionName, args } = decodeFunctionData({ abi: RollupAbi, data });

  let proverId: Fr;
  let archiveRoot: Fr;
  let aggregationObject: Buffer;
  let proof: Proof;

  if (functionName === 'submitEpochRootProof') {
    const [decodedArgs] = args as readonly [
      {
        epochSize: bigint;
        args: readonly [Hex, Hex, Hex, Hex, Hex, Hex, Hex];
        fees: readonly Hex[];
        aggregationObject: Hex;
        proof: Hex;
      },
    ];

    aggregationObject = Buffer.from(hexToBytes(decodedArgs.aggregationObject));
    proverId = Fr.fromString(decodedArgs.args[6]);
    archiveRoot = Fr.fromString(decodedArgs.args[1]);
    proof = Proof.fromBuffer(Buffer.from(hexToBytes(decodedArgs.proof)));
  } else {
    throw new Error(`Unexpected proof method called ${functionName}`);
  }

  if (!proverId.equals(expectedProverId)) {
    throw new Error(`Prover ID mismatch: expected ${expectedProverId} but got ${proverId}`);
  }

  return {
    proverId,
    aggregationObject,
    archiveRoot,
    proof,
  };
}
