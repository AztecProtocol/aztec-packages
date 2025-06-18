import { Blob, BlobDeserializationError } from '@aztec/blob-lib';
import type { BlobSinkClientInterface } from '@aztec/blob-sink/client';
import type {
  EpochProofPublicInputArgs,
  ViemClient,
  ViemCommitteeAttestation,
  ViemHeader,
  ViemPublicClient,
  ViemStateReference,
} from '@aztec/ethereum';
import { asyncPool } from '@aztec/foundation/async-pool';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type InboxAbi, RollupAbi } from '@aztec/l1-artifacts';
import { Body, CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import { Proof } from '@aztec/stdlib/proofs';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { BlockHeader, GlobalVariables, ProposedBlockHeader, StateReference } from '@aztec/stdlib/tx';

import {
  type GetContractEventsReturnType,
  type GetContractReturnType,
  type Hex,
  decodeFunctionData,
  getAbiItem,
  hexToBytes,
  multicall3Abi,
} from 'viem';

import { NoBlobBodiesFoundError } from './errors.js';
import type { DataRetrieval } from './structs/data_retrieval.js';
import type { InboxMessage } from './structs/inbox_message.js';
import type { L1PublishedData, PublishedL2Block } from './structs/published.js';

export type RetrievedL2Block = {
  l2BlockNumber: number;
  archiveRoot: Fr;
  stateReference: StateReference;
  header: ProposedBlockHeader;
  body: Body;
  l1: L1PublishedData;
  chainId: Fr;
  version: Fr;
  attestations: CommitteeAttestation[];
};

export function retrievedBlockToPublishedL2Block(retrievedBlock: RetrievedL2Block): PublishedL2Block {
  const {
    l2BlockNumber,
    archiveRoot,
    stateReference,
    header: proposedHeader,
    body,
    l1,
    chainId,
    version,
    attestations,
  } = retrievedBlock;

  const archive = new AppendOnlyTreeSnapshot(
    archiveRoot,
    l2BlockNumber + 1, // nextAvailableLeafIndex
  );

  const globalVariables = GlobalVariables.from({
    chainId,
    version,
    blockNumber: l2BlockNumber,
    slotNumber: proposedHeader.slotNumber,
    timestamp: proposedHeader.timestamp,
    coinbase: proposedHeader.coinbase,
    feeRecipient: proposedHeader.feeRecipient,
    gasFees: proposedHeader.gasFees,
  });

  const header = BlockHeader.from({
    lastArchive: new AppendOnlyTreeSnapshot(proposedHeader.lastArchiveRoot, l2BlockNumber),
    contentCommitment: proposedHeader.contentCommitment,
    state: stateReference,
    globalVariables,
    totalFees: body.txEffects.reduce((accum, txEffect) => accum.add(txEffect.transactionFee), Fr.ZERO),
    totalManaUsed: proposedHeader.totalManaUsed,
  });

  const block = new L2Block(archive, header, body);

  return {
    block,
    l1,
    attestations,
  };
}

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
  rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
  publicClient: ViemPublicClient,
  blobSinkClient: BlobSinkClientInterface,
  searchStartBlock: bigint,
  searchEndBlock: bigint,
  logger: Logger = createLogger('archiver'),
): Promise<RetrievedL2Block[]> {
  const retrievedBlocks: RetrievedL2Block[] = [];

  let rollupConstants: { chainId: Fr; version: Fr } | undefined;

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

    if (rollupConstants === undefined) {
      const [chainId, version] = await Promise.all([publicClient.getChainId(), rollup.read.getVersion()]);
      rollupConstants = { chainId: new Fr(chainId), version: new Fr(version) };
    }

    const newBlocks = await processL2BlockProposedLogs(
      rollup,
      publicClient,
      blobSinkClient,
      l2BlockProposedLogs,
      rollupConstants,
      logger,
    );
    retrievedBlocks.push(...newBlocks);
    searchStartBlock = lastLog.blockNumber! + 1n;
  } while (searchStartBlock <= searchEndBlock);

  // The asyncpool from processL2BlockProposedLogs will not necessarily return the blocks in order, so we sort them before returning.
  return retrievedBlocks.sort((a, b) => Number(a.l1.blockNumber - b.l1.blockNumber));
}

/**
 * Processes newly received L2BlockProposed logs.
 * @param rollup - The rollup contract
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param logs - L2BlockProposed logs.
 * @returns - An array blocks.
 */
async function processL2BlockProposedLogs(
  rollup: GetContractReturnType<typeof RollupAbi, ViemPublicClient>,
  publicClient: ViemPublicClient,
  blobSinkClient: BlobSinkClientInterface,
  logs: GetContractEventsReturnType<typeof RollupAbi, 'L2BlockProposed'>,
  { chainId, version }: { chainId: Fr; version: Fr },
  logger: Logger,
): Promise<RetrievedL2Block[]> {
  const retrievedBlocks: RetrievedL2Block[] = [];
  await asyncPool(10, logs, async log => {
    const l2BlockNumber = Number(log.args.blockNumber!);
    const archive = log.args.archive!;
    const archiveFromChain = await rollup.read.archiveAt([BigInt(l2BlockNumber)]);
    const blobHashes = log.args.versionedBlobHashes!.map(blobHash => Buffer.from(blobHash.slice(2), 'hex'));

    // The value from the event and contract will match only if the block is in the chain.
    if (archive === archiveFromChain) {
      const block = await getBlockFromRollupTx(
        publicClient,
        blobSinkClient,
        log.transactionHash!,
        blobHashes,
        l2BlockNumber,
        rollup.address,
        logger,
      );

      const l1: L1PublishedData = {
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        timestamp: await getL1BlockTime(publicClient, log.blockNumber),
      };

      retrievedBlocks.push({ ...block, l1, chainId, version });
      logger.trace(`Retrieved L2 block ${l2BlockNumber} from L1 tx ${log.transactionHash}`, {
        l1BlockNumber: log.blockNumber,
        l2BlockNumber,
        archive: archive.toString(),
        attestations: block.attestations,
      });
    } else {
      logger.warn(`Ignoring L2 block ${l2BlockNumber} due to archive root mismatch`, {
        actual: archive,
        expected: archiveFromChain,
      });
    }
  });

  return retrievedBlocks;
}

export async function getL1BlockTime(publicClient: ViemPublicClient, blockNumber: bigint): Promise<bigint> {
  const block = await publicClient.getBlock({ blockNumber, includeTransactions: false });
  return block.timestamp;
}

/**
 * Extracts the first 'propose' method calldata from a multicall3 transaction's data.
 * @param multicall3Data - The multicall3 transaction input data
 * @param rollupAddress - The address of the rollup contract
 * @returns The calldata for the first 'propose' method call to the rollup contract
 */
function extractRollupProposeCalldata(multicall3Data: Hex, rollupAddress: Hex): Hex {
  const { functionName: multicall3FunctionName, args: multicall3Args } = decodeFunctionData({
    abi: multicall3Abi,
    data: multicall3Data,
  });

  if (multicall3FunctionName !== 'aggregate3') {
    throw new Error(`Unexpected multicall3 method called ${multicall3FunctionName}`);
  }

  if (multicall3Args.length !== 1) {
    throw new Error(`Unexpected number of arguments for multicall3`);
  }

  const [calls] = multicall3Args;

  // Find all rollup calls
  const rollupAddressLower = rollupAddress.toLowerCase();

  for (let i = 0; i < calls.length; i++) {
    const addr = calls[i].target;
    if (addr.toLowerCase() !== rollupAddressLower) {
      continue;
    }
    const callData = calls[i].callData;

    try {
      const { functionName: rollupFunctionName } = decodeFunctionData({
        abi: RollupAbi,
        data: callData,
      });

      if (rollupFunctionName === 'propose') {
        return callData;
      }
    } catch {
      // Skip invalid function data
      continue;
    }
  }

  throw new Error(`Rollup address not found in multicall3 args`);
}

/**
 * Gets block from the calldata of an L1 transaction.
 * Assumes that the block was published from an EOA.
 * TODO: Add retries and error management.
 * @param publicClient - The viem public client to use for transaction retrieval.
 * @param txHash - Hash of the tx that published it.
 * @param l2BlockNumber - L2 block number.
 * @returns L2 block from the calldata, deserialized
 */
async function getBlockFromRollupTx(
  publicClient: ViemPublicClient,
  blobSinkClient: BlobSinkClientInterface,
  txHash: `0x${string}`,
  blobHashes: Buffer[], // TODO(md): buffer32?
  l2BlockNumber: number,
  rollupAddress: Hex,
  logger: Logger,
): Promise<Omit<RetrievedL2Block, 'l1' | 'chainId' | 'version'>> {
  const { input: forwarderData, blockHash } = await publicClient.getTransaction({ hash: txHash });

  const rollupData = extractRollupProposeCalldata(forwarderData, rollupAddress);
  const { functionName: rollupFunctionName, args: rollupArgs } = decodeFunctionData({
    abi: RollupAbi,
    data: rollupData,
  });

  if (rollupFunctionName !== 'propose') {
    throw new Error(`Unexpected rollup method called ${rollupFunctionName}`);
  }

  const [decodedArgs, attestations, _blobInput] = rollupArgs! as readonly [
    {
      archive: Hex;
      stateReference: ViemStateReference;
      oracleInput: {
        feeAssetPriceModifier: bigint;
      };
      header: ViemHeader;
      txHashes: readonly Hex[];
    },
    ViemCommitteeAttestation[],
    Hex,
  ];

  // TODO(md): why is the proposed block header different to the actual block header?
  // This is likely going to be a footgun
  const header = ProposedBlockHeader.fromViem(decodedArgs.header);
  const blobBodies = await blobSinkClient.getBlobSidecar(blockHash, blobHashes);
  if (blobBodies.length === 0) {
    throw new NoBlobBodiesFoundError(l2BlockNumber);
  }

  let blockFields: Fr[];
  try {
    blockFields = Blob.toEncodedFields(blobBodies.map(b => b.blob));
  } catch (err: any) {
    if (err instanceof BlobDeserializationError) {
      logger.fatal(err.message);
    } else {
      logger.fatal('Unable to sync: failed to decode fetched blob, this blob was likely not created by us');
    }
    throw err;
  }

  // The blob source gives us blockFields, and we must construct the body from them:
  const body = Body.fromBlobFields(blockFields);

  const archiveRoot = new Fr(Buffer.from(hexToBytes(decodedArgs.archive)));

  const stateReference = StateReference.fromViem(decodedArgs.stateReference);

  return {
    l2BlockNumber,
    archiveRoot,
    stateReference,
    header,
    body,
    attestations: attestations.map(CommitteeAttestation.fromViem),
  };
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
    const { index, hash, l2BlockNumber, rollingHash } = log.args;
    return {
      index: index!,
      leaf: Fr.fromHexString(hash!),
      l1BlockNumber: log.blockNumber,
      l1BlockHash: Buffer32.fromString(log.blockHash),
      l2BlockNumber: Number(l2BlockNumber!),
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
): Promise<{ l1BlockNumber: bigint; l2BlockNumber: number; proverId: Fr; txHash: Hex }[]> {
  const logs = await publicClient.getLogs({
    address: rollupAddress.toString(),
    fromBlock: searchStartBlock,
    toBlock: searchEndBlock ? searchEndBlock : undefined,
    strict: true,
    event: getAbiItem({ abi: RollupAbi, name: 'L2ProofVerified' }),
  });

  return logs.map(log => ({
    l1BlockNumber: log.blockNumber,
    l2BlockNumber: Number(log.args.blockNumber),
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
): Promise<DataRetrieval<{ proof: Proof; proverId: Fr; l2BlockNumber: number; txHash: `0x${string}` }>> {
  const logs = await retrieveL2ProofVerifiedEvents(publicClient, rollupAddress, searchStartBlock, searchEndBlock);
  const retrievedData: { proof: Proof; proverId: Fr; l2BlockNumber: number; txHash: `0x${string}` }[] = [];
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
  publicClient: ViemPublicClient,
  txHash: `0x${string}`,
  expectedProverId: Fr,
): Promise<SubmitBlockProof> {
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
