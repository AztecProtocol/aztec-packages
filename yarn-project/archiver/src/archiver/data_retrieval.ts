import { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import { Body, InboxLeaf, L2Block } from '@aztec/circuit-types';
import { AppendOnlyTreeSnapshot, BlockHeader, Fr, Proof } from '@aztec/circuits.js';
import { asyncPool } from '@aztec/foundation/async-pool';
import { Blob } from '@aztec/foundation/blob';
import { type EthAddress } from '@aztec/foundation/eth-address';
import { type ViemSignature } from '@aztec/foundation/eth-signature';
import { type Logger, createLogger } from '@aztec/foundation/log';
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
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param expectedNextL2BlockNum - The next L2 block number that we expect to find.
 * @returns An array of block; as well as the next eth block to search from.
 */
export async function retrieveBlocksFromRollup(
  rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>,
  publicClient: PublicClient,
  blobSinkClient: BlobSinkClientInterface,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  logger: Logger = createLogger('archiver'),
): Promise<L1Published<L2Block>[]> {
  const retrievedBlocks: L1Published<L2Block>[] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const l2BlockProposedLogs = (
      await rollup.getEvents.L2BlockProposed(
        {},
        {
          fromBlock: searchStartBlock,
          toBlock: searchEndBlock,
        },
      )
    ).filter(log => log.blockNumber! >= searchStartBlock && log.blockNumber! <= searchEndBlock);

    if (l2BlockProposedLogs.length === 0) {
      break;
    }

    const lastLog = l2BlockProposedLogs[l2BlockProposedLogs.length - 1];
    logger.debug(
      `Got ${l2BlockProposedLogs.length} L2 block processed logs for L2 blocks ${l2BlockProposedLogs[0].args.blockNumber}-${lastLog.args.blockNumber} between L1 blocks ${searchStartBlock}-${searchEndBlock}`,
    );

    const newBlocks = await processL2BlockProposedLogs(
      rollup,
      publicClient,
      blobSinkClient,
      l2BlockProposedLogs,
      logger,
    );
    retrievedBlocks.push(...newBlocks);
    searchStartBlock = lastLog.blockNumber! + 1n;
  } while (searchStartBlock <= searchEndBlock);
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
  blobSinkClient: BlobSinkClientInterface,
  logs: GetContractEventsReturnType<typeof RollupAbi, 'L2BlockProposed'>,
  logger: Logger,
): Promise<L1Published<L2Block>[]> {
  const retrievedBlocks: L1Published<L2Block>[] = [];
  await asyncPool(10, logs, async log => {
    const l2BlockNumber = log.args.blockNumber!;
    const archive = log.args.archive!;
    const archiveFromChain = await rollup.read.archiveAt([l2BlockNumber]);

    // The value from the event and contract will match only if the block is in the chain.
    if (archive === archiveFromChain) {
      const block = await getBlockFromRollupTx(
        publicClient,
        blobSinkClient,
        log.transactionHash!,
        l2BlockNumber,
        logger,
      );

      const l1: L1PublishedData = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        timestamp: await getL1BlockTime(publicClient, log.blockNumber),
      };

      retrievedBlocks.push({ data: block, l1 });
    } else {
      logger.warn(`Ignoring L2 block ${l2BlockNumber} due to archive root mismatch`, {
        actual: archive,
        expected: archiveFromChain,
      });
    }
  });

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
  blobSinkClient: BlobSinkClientInterface,
  txHash: `0x${string}`,
  l2BlockNum: bigint,
  logger: Logger,
): Promise<L2Block> {
  const { input: data, blockHash } = await publicClient.getTransaction({ hash: txHash });

  const { functionName, args } = decodeFunctionData({ abi: RollupAbi, data });

  const allowedMethods = ['propose', 'proposeAndClaim'];

  if (!allowedMethods.includes(functionName)) {
    throw new Error(`Unexpected method called ${functionName}`);
  }
  // TODO(#9101): 'bodyHex' will be removed from below
  const [decodedArgs, , bodyHex, blobInputs] = args! as readonly [
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
    Hex,
  ];

  const blobBodies = await blobSinkClient.getBlobSidecar(blockHash);
  if (blobBodies.length === 0) {
    throw new Error(`No blob bodies found for block ${l2BlockNum}`);
  }

  const blockFields = blobBodies.flatMap(b => b.toFields());

  const header = BlockHeader.fromBuffer(Buffer.from(hexToBytes(decodedArgs.header)));
  // TODO(#9101): Retreiving the block body from calldata is a temporary soln before we have
  // either a beacon chain client or link to some blob store. Web2 is ok because we will
  // verify the block body vs the blob as below.
  const blockBody = Body.fromBuffer(Buffer.from(hexToBytes(bodyHex)));

  const legacyBlockFields = blockBody.toBlobFields();

  logger.verbose(`Legacy block fields length: ${legacyBlockFields.length}`);
  logger.verbose(`Block fields length: ${blockFields.length}`);

  logger.verbose(`Legacy block fields: ${legacyBlockFields.map(f => f.toString())}`);
  logger.verbose(`Block fields: ${blockFields.map(f => f.toString())}`);

  // TODO(#9101): The below reconstruction is currently redundant, but once we extract blobs will be the way to construct blocks.
  // The blob source will give us blockFields, and we must construct the body from them:
  // TODO(#8954): When logs are refactored into fields, we won't need to inject them here.
  const reconstructedBlock = Body.fromBlobFields(blockFields, blockBody.unencryptedLogs, blockBody.contractClassLogs);

  if (!reconstructedBlock.toBuffer().equals(blockBody.toBuffer())) {
    // TODO(#9101): Remove below check (without calldata there will be nothing to check against)
    throw new Error(`Block reconstructed from blob fields does not match`);
  }

  // TODO(#9101): Once we stop publishing calldata, we will still need the blobCheck below to ensure that the block we are building does correspond to the blob fields
  const blobCheck = Blob.getBlobs(blockFields);
  if (Blob.getEthBlobEvaluationInputs(blobCheck) !== blobInputs) {
    // NB: We can just check the blobhash here, which is the first 32 bytes of blobInputs
    // A mismatch means that the fields published in the blob in propose() do NOT match those in the extracted block.
    throw new Error(
      `Block body mismatched with blob for block number ${l2BlockNum}. \nExpected: ${Blob.getEthBlobEvaluationInputs(
        blobCheck,
      )} \nGot: ${blobInputs}`,
    );
  }

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
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<DataRetrieval<InboxLeaf>> {
  const retrievedL1ToL2Messages: InboxLeaf[] = [];
  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }

    const messageSentLogs = (
      await inbox.getEvents.MessageSent(
        {},
        {
          fromBlock: searchStartBlock,
          toBlock: searchEndBlock,
        },
      )
    ).filter(log => log.blockNumber! >= searchStartBlock && log.blockNumber! <= searchEndBlock);

    if (messageSentLogs.length === 0) {
      break;
    }

    for (const log of messageSentLogs) {
      const { index, hash } = log.args;
      retrievedL1ToL2Messages.push(new InboxLeaf(index!, Fr.fromHexString(hash!)));
    }

    // handles the case when there are no new messages:
    searchStartBlock = (messageSentLogs.findLast(msgLog => !!msgLog)?.blockNumber || searchStartBlock) + 1n;
  } while (searchStartBlock <= searchEndBlock);
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
    toBlock: searchEndBlock ? searchEndBlock : undefined,
    strict: true,
    event: getAbiItem({ abi: RollupAbi, name: 'L2ProofVerified' }),
  });

  return logs.map(log => ({
    l1BlockNumber: log.blockNumber,
    l2BlockNumber: log.args.blockNumber,
    proverId: Fr.fromHexString(log.args.proverId),
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
    proverId = Fr.fromHexString(decodedArgs.args[6]);
    archiveRoot = Fr.fromHexString(decodedArgs.args[1]);
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
