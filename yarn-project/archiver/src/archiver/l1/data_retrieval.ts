import {
  BlobDeserializationError,
  type CheckpointBlobData,
  SpongeBlob,
  decodeCheckpointBlobDataFromBlobs,
  encodeBlockBlobData,
} from '@aztec/blob-lib';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import type { EpochProofPublicInputArgs } from '@aztec/ethereum/contracts';
import type { ViemClient, ViemPublicClient, ViemPublicDebugClient } from '@aztec/ethereum/types';
import { asyncPool } from '@aztec/foundation/async-pool';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { Body, CommitteeAttestation, L2BlockNew } from '@aztec/stdlib/block';
import { Checkpoint, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { Proof } from '@aztec/stdlib/proofs';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, PartialStateReference, StateReference } from '@aztec/stdlib/tx';

import {
  type GetContractEventsReturnType,
  type GetContractReturnType,
  type Hex,
  decodeFunctionData,
  getAbiItem,
  hexToBytes,
} from 'viem';

import { NoBlobBodiesFoundError } from '../errors.js';
import type { ArchiverInstrumentation } from '../instrumentation.js';
import type { DataRetrieval } from '../structs/data_retrieval.js';
import type { InboxMessage } from '../structs/inbox_message.js';
import type { L1PublishedData } from '../structs/published.js';
import { CalldataRetriever } from './calldata_retriever.js';

export type RetrievedCheckpoint = {
  checkpointNumber: CheckpointNumber;
  archiveRoot: Fr;
  header: CheckpointHeader;
  checkpointBlobData: CheckpointBlobData;
  l1: L1PublishedData;
  chainId: Fr;
  version: Fr;
  attestations: CommitteeAttestation[];
};

export async function retrievedToPublishedCheckpoint({
  checkpointNumber,
  archiveRoot,
  header: checkpointHeader,
  checkpointBlobData,
  l1,
  chainId,
  version,
  attestations,
}: RetrievedCheckpoint): Promise<PublishedCheckpoint> {
  const { blocks: blocksBlobData } = checkpointBlobData;

  // The lastArchiveRoot of a block is the new archive for the previous block.
  const newArchiveRoots = blocksBlobData
    .map(b => b.lastArchiveRoot)
    .slice(1)
    .concat([archiveRoot]);

  // An error will be thrown from `decodeCheckpointBlobDataFromBlobs` if it can't read a field for the
  // `l1ToL2MessageRoot` of the first block. So below we can safely assume it exists:
  const l1toL2MessageTreeRoot = blocksBlobData[0].l1ToL2MessageRoot!;

  const spongeBlob = SpongeBlob.init();
  const l2Blocks: L2BlockNew[] = [];
  for (let i = 0; i < blocksBlobData.length; i++) {
    const blockBlobData = blocksBlobData[i];
    const { blockEndMarker, blockEndStateField, lastArchiveRoot, noteHashRoot, nullifierRoot, publicDataRoot } =
      blockBlobData;

    const l2BlockNumber = blockEndMarker.blockNumber;

    const globalVariables = GlobalVariables.from({
      chainId,
      version,
      blockNumber: l2BlockNumber,
      slotNumber: checkpointHeader.slotNumber,
      timestamp: blockEndMarker.timestamp,
      coinbase: checkpointHeader.coinbase,
      feeRecipient: checkpointHeader.feeRecipient,
      gasFees: checkpointHeader.gasFees,
    });

    const state = StateReference.from({
      l1ToL2MessageTree: new AppendOnlyTreeSnapshot(
        l1toL2MessageTreeRoot,
        blockEndStateField.l1ToL2MessageNextAvailableLeafIndex,
      ),
      partial: PartialStateReference.from({
        noteHashTree: new AppendOnlyTreeSnapshot(noteHashRoot, blockEndStateField.noteHashNextAvailableLeafIndex),
        nullifierTree: new AppendOnlyTreeSnapshot(nullifierRoot, blockEndStateField.nullifierNextAvailableLeafIndex),
        publicDataTree: new AppendOnlyTreeSnapshot(publicDataRoot, blockEndStateField.publicDataNextAvailableLeafIndex),
      }),
    });

    const body = Body.fromTxBlobData(checkpointBlobData.blocks[0].txs);

    const blobFields = encodeBlockBlobData(blockBlobData);
    await spongeBlob.absorb(blobFields);

    const clonedSpongeBlob = spongeBlob.clone();
    const spongeBlobHash = await clonedSpongeBlob.squeeze();

    const header = BlockHeader.from({
      lastArchive: new AppendOnlyTreeSnapshot(lastArchiveRoot, l2BlockNumber),
      state,
      spongeBlobHash,
      globalVariables,
      totalFees: body.txEffects.reduce((accum, txEffect) => accum.add(txEffect.transactionFee), Fr.ZERO),
      totalManaUsed: new Fr(blockEndStateField.totalManaUsed),
    });

    const newArchive = new AppendOnlyTreeSnapshot(newArchiveRoots[i], l2BlockNumber + 1);

    l2Blocks.push(new L2BlockNew(newArchive, header, body, checkpointNumber, i));
  }

  const lastBlock = l2Blocks.at(-1)!;
  const checkpoint = Checkpoint.from({
    archive: new AppendOnlyTreeSnapshot(archiveRoot, lastBlock.number + 1),
    header: checkpointHeader,
    blocks: l2Blocks,
    number: checkpointNumber,
  });

  return PublishedCheckpoint.from({ checkpoint, l1, attestations });
}

/**
 * Fetches new checkpoints.
 * @param rollup - The rollup contract instance.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param debugClient - The viem debug client to use for trace/debug RPC methods (optional).
 * @param blobSinkClient - The blob sink client for fetching blob data.
 * @param searchStartBlock - The block number to use for starting the search.
 * @param searchEndBlock - The highest block number that we should search up to.
 * @param contractAddresses - The contract addresses (governanceProposerAddress, slashFactoryAddress, slashingProposerAddress).
 * @param instrumentation - The archiver instrumentation instance.
 * @param logger - The logger instance.
 * @param isHistoricalSync - Whether this is a historical sync.
 * @returns An array of retrieved checkpoints.
 */
export async function retrieveCheckpointsFromRollup(
  rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
  publicClient: ViemPublicClient,
  debugClient: ViemPublicDebugClient,
  blobSinkClient: BlobSinkClientInterface,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  contractAddresses: {
    governanceProposerAddress: EthAddress;
    slashFactoryAddress?: EthAddress;
    slashingProposerAddress: EthAddress;
  },
  instrumentation: ArchiverInstrumentation,
  logger: Logger = createLogger('archiver'),
  isHistoricalSync: boolean = false,
): Promise<RetrievedCheckpoint[]> {
  const retrievedCheckpoints: RetrievedCheckpoint[] = [];

  let rollupConstants: { chainId: Fr; version: Fr; targetCommitteeSize: number } | undefined;

  do {
    if (searchStartBlock > searchEndBlock) {
      break;
    }
    const checkpointProposedLogs = (
      await rollup.getEvents.CheckpointProposed(
        {},
        {
          fromBlock: searchStartBlock,
          toBlock: searchEndBlock,
        },
      )
    ).filter(log => log.blockNumber! >= searchStartBlock && log.blockNumber! <= searchEndBlock);

    if (checkpointProposedLogs.length === 0) {
      break;
    }

    const lastLog = checkpointProposedLogs.at(-1)!;
    logger.debug(
      `Got ${checkpointProposedLogs.length} processed logs for checkpoints  ${checkpointProposedLogs[0].args.checkpointNumber}-${lastLog.args.checkpointNumber} between L1 blocks ${searchStartBlock}-${searchEndBlock}`,
    );

    if (rollupConstants === undefined) {
      const [chainId, version, targetCommitteeSize] = await Promise.all([
        publicClient.getChainId(),
        rollup.read.getVersion(),
        rollup.read.getTargetCommitteeSize(),
      ]);
      rollupConstants = {
        chainId: new Fr(chainId),
        version: new Fr(version),
        targetCommitteeSize: Number(targetCommitteeSize),
      };
    }

    const newCheckpoints = await processCheckpointProposedLogs(
      rollup,
      publicClient,
      debugClient,
      blobSinkClient,
      checkpointProposedLogs,
      rollupConstants,
      contractAddresses,
      instrumentation,
      logger,
      isHistoricalSync,
    );
    retrievedCheckpoints.push(...newCheckpoints);
    searchStartBlock = lastLog.blockNumber! + 1n;
  } while (searchStartBlock <= searchEndBlock);

  // The asyncPool from processCheckpointProposedLogs will not necessarily return the checkpoints in order, so we sort them before returning.
  return retrievedCheckpoints.sort((a, b) => Number(a.l1.blockNumber - b.l1.blockNumber));
}

/**
 * Processes newly received CheckpointProposed logs.
 * @param rollup - The rollup contract instance.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param debugClient - The viem debug client to use for trace/debug RPC methods (optional).
 * @param blobSinkClient - The blob sink client for fetching blob data.
 * @param logs - CheckpointProposed logs.
 * @param rollupConstants - The rollup constants (chainId, version, targetCommitteeSize).
 * @param contractAddresses - The contract addresses (governanceProposerAddress, slashFactoryAddress, slashingProposerAddress).
 * @param instrumentation - The archiver instrumentation instance.
 * @param logger - The logger instance.
 * @param isHistoricalSync - Whether this is a historical sync.
 * @returns An array of retrieved checkpoints.
 */
async function processCheckpointProposedLogs(
  rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
  publicClient: ViemPublicClient,
  debugClient: ViemPublicDebugClient,
  blobSinkClient: BlobSinkClientInterface,
  logs: GetContractEventsReturnType<typeof RollupAbi, 'CheckpointProposed'>,
  { chainId, version, targetCommitteeSize }: { chainId: Fr; version: Fr; targetCommitteeSize: number },
  contractAddresses: {
    governanceProposerAddress: EthAddress;
    slashFactoryAddress?: EthAddress;
    slashingProposerAddress: EthAddress;
  },
  instrumentation: ArchiverInstrumentation,
  logger: Logger,
  isHistoricalSync: boolean,
): Promise<RetrievedCheckpoint[]> {
  const retrievedCheckpoints: RetrievedCheckpoint[] = [];
  const calldataRetriever = new CalldataRetriever(
    publicClient,
    debugClient,
    targetCommitteeSize,
    instrumentation,
    logger,
    { ...contractAddresses, rollupAddress: EthAddress.fromString(rollup.address) },
  );

  await asyncPool(10, logs, async log => {
    const checkpointNumber = CheckpointNumber.fromBigInt(log.args.checkpointNumber!);
    const archive = log.args.archive!;
    const archiveFromChain = await rollup.read.archiveAt([BigInt(checkpointNumber)]);
    const blobHashes = log.args.versionedBlobHashes!.map(blobHash => Buffer.from(blobHash.slice(2), 'hex'));

    // The value from the event and contract will match only if the checkpoint is in the chain.
    if (archive === archiveFromChain) {
      const checkpoint = await calldataRetriever.getCheckpointFromRollupTx(
        log.transactionHash!,
        blobHashes,
        checkpointNumber,
      );
      const checkpointBlobData = await getCheckpointBlobDataFromBlobs(
        blobSinkClient,
        checkpoint.blockHash,
        blobHashes,
        checkpointNumber,
        logger,
        isHistoricalSync,
      );

      const l1: L1PublishedData = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        timestamp: await getL1BlockTime(publicClient, log.blockNumber),
      };

      retrievedCheckpoints.push({ ...checkpoint, checkpointBlobData, l1, chainId, version });
      logger.trace(`Retrieved checkpoint ${checkpointNumber} from L1 tx ${log.transactionHash}`, {
        l1BlockNumber: log.blockNumber,
        checkpointNumber,
        archive: archive.toString(),
        attestations: checkpoint.attestations,
      });
    } else {
      logger.warn(`Ignoring checkpoint ${checkpointNumber} due to archive root mismatch`, {
        actual: archive,
        expected: archiveFromChain,
      });
    }
  });

  return retrievedCheckpoints;
}

export async function getL1BlockTime(publicClient: ViemPublicClient, blockNumber: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: false });
  return block.timestamp;
}

export async function getCheckpointBlobDataFromBlobs(
  blobSinkClient: BlobSinkClientInterface,
  blockHash: string,
  blobHashes: Buffer<ArrayBufferLike>[],
  checkpointNumber: CheckpointNumber,
  logger: Logger,
  isHistoricalSync: boolean,
): Promise<CheckpointBlobData> {
  const blobBodies = await blobSinkClient.getBlobSidecar(blockHash, blobHashes, undefined, { isHistoricalSync });
  if (blobBodies.length === 0) {
    throw new NoBlobBodiesFoundError(checkpointNumber);
  }

  let checkpointBlobData: CheckpointBlobData;
  try {
    // Attempt to decode the checkpoint blob data.
    checkpointBlobData = decodeCheckpointBlobDataFromBlobs(blobBodies.map(b => b.blob));
  } catch (err: any) {
    if (err instanceof BlobDeserializationError) {
      logger.fatal(err.message);
    } else {
      logger.fatal('Unable to sync: failed to decode fetched blob, this blob was likely not created by us');
    }
    // Throwing an error since this is most likely caused by a bug.
    throw err;
  }

  return checkpointBlobData;
}

/** Given an L1 to L2 message, retrieves its corresponding event from the Inbox within a specific block range. */
export async function retrieveL1ToL2Message(
  inbox: GetContractReturnType<typeof InboxAbi, ViemClient>,
  leaf: Fr,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<InboxMessage | undefined> {
  const logs = await inbox.getEvents.MessageSent({ hash: leaf.toString() }, { fromBlock, toBlock });

  const messages = mapLogsInboxMessage(logs);
  return messages.length > 0 ? messages[0] : undefined;
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
  inbox: GetContractReturnType<typeof InboxAbi, ViemClient>,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
): Promise<InboxMessage[]> {
  const retrievedL1ToL2Messages: InboxMessage[] = [];
  while (searchStartBlock <= searchEndBlock) {
    const messageSentLogs = (
      await inbox.getEvents.MessageSent({}, { fromBlock: searchStartBlock, toBlock: searchEndBlock })
    ).filter(log => log.blockNumber! >= searchStartBlock && log.blockNumber! <= searchEndBlock);

    if (messageSentLogs.length === 0) {
      break;
    }

    retrievedL1ToL2Messages.push(...mapLogsInboxMessage(messageSentLogs));
    searchStartBlock = messageSentLogs.at(-1)!.blockNumber + 1n;
  }

  return retrievedL1ToL2Messages;
}

function mapLogsInboxMessage(logs: GetContractEventsReturnType<typeof InboxAbi, 'MessageSent'>): InboxMessage[] {
  return logs.map(log => {
    const { index, hash, checkpointNumber, rollingHash } = log.args;
    return {
      index: index!,
      leaf: Fr.fromHexString(hash!),
      l1BlockNumber: log.blockNumber,
      l1BlockHash: Buffer32.fromString(log.blockHash),
      checkpointNumber: CheckpointNumber.fromBigInt(checkpointNumber!),
      rollingHash: Buffer16.fromString(rollingHash!),
    };
  });
}

/** Retrieves L2ProofVerified events from the rollup contract. */
export async function retrieveL2ProofVerifiedEvents(
  publicClient: ViemPublicClient,
  rollupAddress: EthAddress,
  searchStartBlock: bigint,
  searchEndBlock?: bigint,
): Promise<{ l1BlockNumber: bigint; checkpointNumber: CheckpointNumber; proverId: Fr; txHash: Hex }[]> {
  const logs = await publicClient.getLogs({
    address: rollupAddress.toString(),
    fromBlock: searchStartBlock,
    toBlock: searchEndBlock ? searchEndBlock : undefined,
    strict: true,
    event: getAbiItem({ abi: RollupAbi, name: 'L2ProofVerified' }),
  });

  return logs.map(log => ({
    l1BlockNumber: log.blockNumber,
    checkpointNumber: CheckpointNumber.fromBigInt(log.args.checkpointNumber),
    proverId: Fr.fromHexString(log.args.proverId),
    txHash: log.transactionHash,
  }));
}

/** Retrieve submitted proofs from the rollup contract */
export async function retrieveL2ProofsFromRollup(
  publicClient: ViemPublicClient,
  rollupAddress: EthAddress,
  searchStartBlock: bigint,
  searchEndBlock?: bigint,
): Promise<DataRetrieval<{ proof: Proof; proverId: Fr; checkpointNumber: number; txHash: `0x${string}` }>> {
  const logs = await retrieveL2ProofVerifiedEvents(publicClient, rollupAddress, searchStartBlock, searchEndBlock);
  const retrievedData: { proof: Proof; proverId: Fr; checkpointNumber: number; txHash: `0x${string}` }[] = [];
  const lastProcessedL1BlockNumber = logs.length > 0 ? logs.at(-1)!.l1BlockNumber : searchStartBlock - 1n;

  for (const { txHash, proverId, checkpointNumber } of logs) {
    const proofData = await getProofFromSubmitProofTx(publicClient, txHash, proverId);
    retrievedData.push({ proof: proofData.proof, proverId: proofData.proverId, checkpointNumber, txHash });
  }
  return {
    retrievedData,
    lastProcessedL1BlockNumber,
  };
}

export type SubmitEpochProof = {
  archiveRoot: Fr;
  proverId: Fr;
  proof: Proof;
};

/**
 * Gets epoch proof metadata (archive root and proof) from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param expectedProverId - Expected prover ID.
 * @returns Epoch proof metadata from the calldata, deserialized.
 */
export async function getProofFromSubmitProofTx(
  publicClient: ViemPublicClient,
  txHash: `0x${string}`,
  expectedProverId: Fr,
): Promise<SubmitEpochProof> {
  const { input: data } = await publicClient.getTransaction({ hash: txHash });
  const { functionName, args } = decodeFunctionData({ abi: RollupAbi, data });

  let proverId: Fr;
  let archiveRoot: Fr;
  let proof: Proof;

  if (functionName === 'submitEpochRootProof') {
    const [decodedArgs] = args as readonly [
      {
        start: bigint;
        end: bigint;
        args: EpochProofPublicInputArgs;
        fees: readonly Hex[];
        proof: Hex;
      },
    ];

    proverId = Fr.fromHexString(decodedArgs.args.proverId);
    archiveRoot = Fr.fromHexString(decodedArgs.args.endArchive);
    proof = Proof.fromBuffer(Buffer.from(hexToBytes(decodedArgs.proof)));
  } else {
    throw new Error(`Unexpected proof method called ${functionName}`);
  }

  if (!proverId.equals(expectedProverId)) {
    throw new Error(`Prover ID mismatch: expected ${expectedProverId} but got ${proverId}`);
  }

  return {
    proverId,
    archiveRoot,
    proof,
  };
}
