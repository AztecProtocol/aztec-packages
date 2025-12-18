import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EventSelector, FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { BlockParameter, DataInBlock } from '@aztec/stdlib/block';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier, siloPrivateLog } from '@aztec/stdlib/hash';
import { type AztecNode, MAX_RPC_LEN } from '@aztec/stdlib/interfaces/server';
import { PrivateLogWithTxData, PublicLog, PublicLogWithTxData, TxScopedL2Log } from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { ORACLE_VERSION } from '../../oracle_version.js';
import {
  AnchorBlockDataProvider,
  type CapsuleDataProvider,
  type ContractDataProvider,
  type NoteDataProvider,
  PrivateEventDataProvider,
} from '../../storage/index.js';
import type { ExecutionStats } from '../execution_data_provider.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { LogRetrievalRequest } from '../noir-structs/log_retrieval_request.js';
import { LogRetrievalResponse } from '../noir-structs/log_retrieval_response.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';
import type { ProxiedNode } from '../proxied_node.js';

// TODO: this might not be the final home for these functions,
// it's just a way of starting to dissolve PXEOracleInterface

export async function getFunctionArtifact(
  contractAddress: AztecAddress,
  selector: FunctionSelector,
  contractDataProvider: ContractDataProvider,
): Promise<FunctionArtifactWithContractName> {
  const artifact = await contractDataProvider.getFunctionArtifact(contractAddress, selector);
  if (!artifact) {
    throw new Error(`Function artifact not found for contract ${contractAddress} and selector ${selector}.`);
  }
  const debug = await contractDataProvider.getFunctionDebugMetadata(contractAddress, selector);
  return {
    ...artifact,
    debug,
  };
}

export function assertCompatibleOracleVersion(version: number): void {
  if (version !== ORACLE_VERSION) {
    throw new Error(`Incompatible oracle version. Expected version ${ORACLE_VERSION}, got ${version}.`);
  }
}

export function getStats(aztecNode: AztecNode): ExecutionStats {
  const nodeRPCCalls =
    typeof (aztecNode as ProxiedNode).getStats === 'function' ? (aztecNode as ProxiedNode).getStats() : {};

  return { nodeRPCCalls };
}

// TODO(#14555): delete this function and implement this behavior in the node instead
export async function getPublicLogByTag(
  tag: Fr,
  contractAddress: AztecAddress,
  aztecNode: AztecNode,
): Promise<PublicLogWithTxData | null> {
  const logs = await internalGetPublicLogsByTagsFromContract([tag], contractAddress, aztecNode);
  const logsForTag = logs[0];

  if (logsForTag.length == 0) {
    return null;
  } else if (logsForTag.length > 1) {
    // TODO(#11627): handle this case
    throw new Error(
      `Got ${logsForTag.length} logs for tag ${tag} and contract ${contractAddress.toString()}. getPublicLogByTag currently only supports a single log per tag`,
    );
  }

  const scopedLog = logsForTag[0];

  // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
  // we need to make a second call to the node for `getTxEffect`.
  // TODO(#9789): bundle this information in the `getLogsByTag` call.
  const txEffect = await aztecNode.getTxEffect(scopedLog.txHash);
  if (txEffect == undefined) {
    throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
  }

  return new PublicLogWithTxData(
    scopedLog.log.getEmittedFieldsWithoutTag(),
    scopedLog.txHash,
    txEffect.data.noteHashes,
    txEffect.data.nullifiers[0],
  );
}

// TODO(#14555): delete this function and implement this behavior in the node instead
export async function getPrivateLogByTag(siloedTag: Fr, aztecNode: AztecNode): Promise<PrivateLogWithTxData | null> {
  const logs = await internalGetPrivateLogsByTags([siloedTag], aztecNode);
  const logsForTag = logs[0];

  if (logsForTag.length == 0) {
    return null;
  } else if (logsForTag.length > 1) {
    // TODO(#11627): handle this case
    throw new Error(
      `Got ${logsForTag.length} logs for tag ${siloedTag}. getPrivateLogByTag currently only supports a single log per tag`,
    );
  }

  const scopedLog = logsForTag[0];

  // getLogsByTag doesn't have all of the information that we need (notably note hashes and the first nullifier), so
  // we need to make a second call to the node for `getTxEffect`.
  // TODO(#9789): bundle this information in the `getLogsByTag` call.
  const txEffect = await aztecNode.getTxEffect(scopedLog.txHash);
  if (txEffect == undefined) {
    throw new Error(`Unexpected: failed to retrieve tx effects for tx ${scopedLog.txHash} which is known to exist`);
  }

  return new PrivateLogWithTxData(
    scopedLog.log.getEmittedFieldsWithoutTag(),
    scopedLog.txHash,
    txEffect.data.noteHashes,
    txEffect.data.nullifiers[0],
  );
}

// TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
// was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
async function internalGetPrivateLogsByTags(tags: Fr[], aztecNode: AztecNode): Promise<TxScopedL2Log[][]> {
  const allLogs = await aztecNode.getLogsByTags(tags);
  return allLogs.map(logs => logs.filter(log => !log.isFromPublic));
}

// TODO(#12656): Make this a public function on the AztecNode interface and remove the original getLogsByTags. This
// was not done yet as we were unsure about the API and we didn't want to introduce a breaking change.
async function internalGetPublicLogsByTagsFromContract(
  tags: Fr[],
  contractAddress: AztecAddress,
  aztecNode: AztecNode,
): Promise<TxScopedL2Log[][]> {
  const allLogs = await aztecNode.getLogsByTags(tags);
  const allPublicLogs = allLogs.map(logs => logs.filter(log => log.isFromPublic));
  return allPublicLogs.map(logs => logs.filter(log => (log.log as PublicLog).contractAddress.equals(contractAddress)));
}

export async function bulkRetrieveLogs(
  contractAddress: AztecAddress,
  logRetrievalRequestsArrayBaseSlot: Fr,
  logRetrievalResponsesArrayBaseSlot: Fr,
  capsuleDataProvider: CapsuleDataProvider,
  aztecNode: AztecNode,
) {
  // We read all log retrieval requests and process them all concurrently. This makes the process much faster as we
  // don't need to wait for the network round-trip.
  const logRetrievalRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot)
  ).map(LogRetrievalRequest.fromFields);

  const maybeLogRetrievalResponses = await Promise.all(
    logRetrievalRequests.map(async request => {
      // TODO(#14555): remove these internal functions and have node endpoints that do this instead
      const [publicLog, privateLog] = await Promise.all([
        getPublicLogByTag(request.unsiloedTag, request.contractAddress, aztecNode),
        getPrivateLogByTag(await siloPrivateLog(request.contractAddress, request.unsiloedTag), aztecNode),
      ]);

      if (publicLog !== null) {
        if (privateLog !== null) {
          throw new Error(
            `Found both a public and private log when searching for tag ${request.unsiloedTag} from contract ${request.contractAddress}`,
          );
        }

        return new LogRetrievalResponse(
          publicLog.logPayload,
          publicLog.txHash,
          publicLog.uniqueNoteHashesInTx,
          publicLog.firstNullifierInTx,
        );
      } else if (privateLog !== null) {
        return new LogRetrievalResponse(
          privateLog.logPayload,
          privateLog.txHash,
          privateLog.uniqueNoteHashesInTx,
          privateLog.firstNullifierInTx,
        );
      } else {
        return null;
      }
    }),
  );

  // Requests are cleared once we're done.
  await capsuleDataProvider.setCapsuleArray(contractAddress, logRetrievalRequestsArrayBaseSlot, []);

  // The responses are stored as Option<LogRetrievalResponse> in a second CapsuleArray.
  await capsuleDataProvider.setCapsuleArray(
    contractAddress,
    logRetrievalResponsesArrayBaseSlot,
    maybeLogRetrievalResponses.map(LogRetrievalResponse.toSerializedOption),
  );
}

export async function getNullifierIndex(nullifier: Fr, aztecNode: AztecNode) {
  return await findLeafIndex('latest', MerkleTreeId.NULLIFIER_TREE, nullifier, aztecNode);
}

async function findLeafIndex(
  blockNumber: BlockParameter,
  treeId: MerkleTreeId,
  leafValue: Fr,
  aztecNode: AztecNode,
): Promise<bigint | undefined> {
  const [leafIndex] = await aztecNode.findLeavesIndexes(blockNumber, treeId, [leafValue]);
  return leafIndex?.data;
}

export async function validateEnqueuedNotesAndEvents(
  contractAddress: AztecAddress,
  noteValidationRequestsArrayBaseSlot: Fr,
  eventValidationRequestsArrayBaseSlot: Fr,
  capsuleDataProvider: CapsuleDataProvider,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  noteDataProvider: NoteDataProvider,
  privateEventDataProvider: PrivateEventDataProvider,
): Promise<void> {
  // We read all note and event validation requests and process them all concurrently. This makes the process much
  // faster as we don't need to wait for the network round-trip.
  const noteValidationRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot)
  ).map(NoteValidationRequest.fromFields);

  const eventValidationRequests = (
    await capsuleDataProvider.readCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot)
  ).map(EventValidationRequest.fromFields);

  const noteDeliveries = noteValidationRequests.map(request =>
    deliverNote(
      request.contractAddress,
      request.owner,
      request.storageSlot,
      request.randomness,
      request.noteNonce,
      request.content,
      request.noteHash,
      request.nullifier,
      request.txHash,
      request.recipient,
      anchorBlockDataProvider,
      aztecNode,
      noteDataProvider,
    ),
  );

  const eventDeliveries = eventValidationRequests.map(request =>
    deliverEvent(
      request.contractAddress,
      request.eventTypeId,
      request.serializedEvent,
      request.eventCommitment,
      request.txHash,
      request.recipient,
      anchorBlockDataProvider,
      aztecNode,
      privateEventDataProvider,
    ),
  );

  await Promise.all([...noteDeliveries, ...eventDeliveries]);

  // Requests are cleared once we're done.
  await capsuleDataProvider.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
  await capsuleDataProvider.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
}

export async function deliverNote(
  contractAddress: AztecAddress,
  owner: AztecAddress,
  storageSlot: Fr,
  randomness: Fr,
  noteNonce: Fr,
  content: Fr[],
  noteHash: Fr,
  nullifier: Fr,
  txHash: TxHash,
  recipient: AztecAddress,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  noteDataProvider: NoteDataProvider,
): Promise<void> {
  // We are going to store the new note in the NoteDataProvider, which will let us later return it via `getNotes`.
  // There's two things we need to check before we do this however:
  //  - we must make sure the note does actually exist in the note hash tree
  //  - we need to check if the note has already been nullified
  //
  // Failing to do either of the above would result in circuits getting either non-existent notes and failing to
  // produce inclusion proofs for them, or getting nullified notes and producing duplicate nullifiers, both of which
  // are catastrophic failure modes.
  //
  // Note that adding a note and removing it is *not* equivalent to never adding it in the first place. A nullifier
  // emitted in a block that comes after note creation might result in the note being de-nullified by a chain reorg,
  // so we must store both the note hash and nullifier block information.

  // We avoid making node queries at 'latest' since we don't want to process notes or nullifiers that only exist ahead
  // in time of the locally synced state.
  // Note that while this technically results in historical queries, we perform it at the latest locally synced block
  // number which *should* be recent enough to be available, even for non-archive nodes.
  // Also note that the note should never be ahead of the synced block here since `fetchTaggedLogs` only processes
  // logs up to the synced block making this only an additional safety check.
  const syncedBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

  // By computing siloed and unique note hashes ourselves we prevent contracts from interfering with the note storage
  // of other contracts, which would constitute a security breach.
  const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, await siloNoteHash(contractAddress, noteHash));
  const siloedNullifier = await siloNullifier(contractAddress, nullifier);

  const txEffect = await aztecNode.getTxEffect(txHash);
  if (!txEffect) {
    throw new Error(`Could not find tx effect for tx hash ${txHash}`);
  }

  if (txEffect.l2BlockNumber > syncedBlockNumber) {
    throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
  }

  const noteInTx = txEffect.data.noteHashes.some(nh => nh.equals(uniqueNoteHash));
  if (!noteInTx) {
    throw new Error(`Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present in tx ${txHash}`);
  }

  // We store notes by their index in the global note hash tree, which has the convenient side effect of validating
  // note existence in said tree. We concurrently also check if the note's nullifier exists, performing all node
  // queries in a single round-trip.
  const [[uniqueNoteHashTreeIndexInBlock], [nullifierIndex]] = await Promise.all([
    aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NOTE_HASH_TREE, [uniqueNoteHash]),
    aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [siloedNullifier]),
  ]);

  if (uniqueNoteHashTreeIndexInBlock === undefined) {
    throw new Error(
      `Note hash ${noteHash} (uniqued as ${uniqueNoteHash}) is not present on the tree at block ${syncedBlockNumber} (from tx ${txHash})`,
    );
  }

  const noteDao = new NoteDao(
    new Note(content),
    contractAddress,
    owner,
    storageSlot,
    randomness,
    noteNonce,
    noteHash,
    siloedNullifier,
    txHash,
    uniqueNoteHashTreeIndexInBlock.l2BlockNumber,
    uniqueNoteHashTreeIndexInBlock.l2BlockHash.toString(),
    uniqueNoteHashTreeIndexInBlock.data,
  );

  // The note was found by `recipient`, so we use that as the scope when storing the note.
  await noteDataProvider.addNotes([noteDao], recipient);

  if (nullifierIndex !== undefined) {
    const { data: _, ...blockHashAndNum } = nullifierIndex;
    await noteDataProvider.applyNullifiers([{ data: siloedNullifier, ...blockHashAndNum }]);
  }
}

export async function deliverEvent(
  contractAddress: AztecAddress,
  selector: EventSelector,
  content: Fr[],
  eventCommitment: Fr,
  txHash: TxHash,
  scope: AztecAddress,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  aztecNode: AztecNode,
  privateEventDataProvider: PrivateEventDataProvider,
): Promise<void> {
  // While using 'latest' block number would be fine for private events since they cannot be accessed from Aztec.nr
  // (and thus we're less concerned about being ahead of the synced block), we use the synced block number to
  // maintain consistent behavior in the PXE. Additionally, events should never be ahead of the synced block here
  // since `fetchTaggedLogs` only processes logs up to the synced block.
  const [syncedBlockHeader, siloedEventCommitment, txEffect] = await Promise.all([
    anchorBlockDataProvider.getBlockHeader(),
    siloNullifier(contractAddress, eventCommitment),
    aztecNode.getTxEffect(txHash),
  ]);

  const syncedBlockNumber = syncedBlockHeader.getBlockNumber();

  if (!txEffect) {
    throw new Error(`Could not find tx effect for tx hash ${txHash}`);
  }

  if (txEffect.l2BlockNumber > syncedBlockNumber) {
    throw new Error(`Could not find tx effect for tx hash ${txHash} as of block number ${syncedBlockNumber}`);
  }

  const eventInTx = txEffect.data.nullifiers.some(n => n.equals(siloedEventCommitment));
  if (!eventInTx) {
    throw new Error(
      `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present in tx ${txHash}`,
    );
  }

  const [nullifierIndex] = await aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, [
    siloedEventCommitment,
  ]);

  if (nullifierIndex === undefined) {
    throw new Error(
      `Event commitment ${eventCommitment} (siloed as ${siloedEventCommitment}) is not present on the nullifier tree at block ${syncedBlockNumber} (from tx ${txHash})`,
    );
  }

  return privateEventDataProvider.storePrivateEventLog(
    selector,
    content,
    Number(nullifierIndex.data), // Index of the event commitment in the nullifier tree
    {
      contractAddress,
      scope,
      txHash,
      l2BlockNumber: nullifierIndex.l2BlockNumber, // Block number in which the event was emitted
      l2BlockHash: nullifierIndex.l2BlockHash, // Block hash in which the event was emitted
    },
  );
}

/**
 * Looks for nullifiers of active contract notes and marks them as nullified if a nullifier is found.
 *
 * Fetches notes from the NoteDataProvider and checks which nullifiers are present in the
 * onchain nullifier Merkle tree -  up to the latest locally synced block. We use the
 * locally synced block instead of querying the chain's 'latest' block to ensure correctness:
 * notes are only marked nullified once their corresponding nullifier has been included in a
 * block up to which the PXE has synced.
 * This allows recent nullifications to be processed even if the node is not an archive node.
 *
 * @param contractAddress - The contract whose notes should be checked and nullified.
 */
export async function syncNoteNullifiers(
  contractAddress: AztecAddress,
  anchorBlockDataProvider: AnchorBlockDataProvider,
  noteDataProvider: NoteDataProvider,
  aztecNode: AztecNode,
) {
  const syncedBlockNumber = (await anchorBlockDataProvider.getBlockHeader()).getBlockNumber();

  const contractNotes = await noteDataProvider.getNotes({ contractAddress });

  if (contractNotes.length === 0) {
    return;
  }

  const nullifiersToCheck = contractNotes.map(note => note.siloedNullifier);
  const nullifierBatches = nullifiersToCheck.reduce(
    (acc, nullifier) => {
      if (acc[acc.length - 1].length < MAX_RPC_LEN) {
        acc[acc.length - 1].push(nullifier);
      } else {
        acc.push([nullifier]);
      }
      return acc;
    },
    [[]] as Fr[][],
  );
  const nullifierIndexes = (
    await Promise.all(
      nullifierBatches.map(batch => aztecNode.findLeavesIndexes(syncedBlockNumber, MerkleTreeId.NULLIFIER_TREE, batch)),
    )
  ).flat();

  const foundNullifiers = nullifiersToCheck
    .map((nullifier, i) => {
      if (nullifierIndexes[i] !== undefined) {
        return { ...nullifierIndexes[i], ...{ data: nullifier } } as DataInBlock<Fr>;
      }
    })
    .filter(nullifier => nullifier !== undefined) as DataInBlock<Fr>[];

  await noteDataProvider.applyNullifiers(foundNullifiers);
}
