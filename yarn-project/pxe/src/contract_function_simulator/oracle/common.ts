import type { Fr } from '@aztec/foundation/curves/bn254';
import type { EventSelector, FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { TxHash } from '@aztec/stdlib/tx';

import { NoteSynchronizer } from '../../notes/note_synchronizer.js';
import { ORACLE_VERSION } from '../../oracle_version.js';
import {
  AnchorBlockDataProvider,
  type CapsuleDataProvider,
  type ContractDataProvider,
  type NoteDataProvider,
  PrivateEventDataProvider,
} from '../../storage/index.js';
import { EventValidationRequest } from '../noir-structs/event_validation_request.js';
import { NoteValidationRequest } from '../noir-structs/note_validation_request.js';

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

  const noteSynchronizer = new NoteSynchronizer(noteDataProvider, aztecNode, anchorBlockDataProvider);

  const noteDeliveries = noteValidationRequests.map(request =>
    noteSynchronizer.deliverNote(
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
