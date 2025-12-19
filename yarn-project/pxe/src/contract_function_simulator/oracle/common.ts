import type { Fr } from '@aztec/foundation/curves/bn254';
import type { FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';

import { EventService } from '../../events/event_service.js';
import { NoteService } from '../../notes/note_service.js';
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

  const noteService = new NoteService(noteDataProvider, aztecNode, anchorBlockDataProvider);

  const noteDeliveries = noteValidationRequests.map(request =>
    noteService.deliverNote(
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

  const eventService = new EventService(anchorBlockDataProvider, aztecNode, privateEventDataProvider);

  const eventDeliveries = eventValidationRequests.map(request =>
    eventService.deliverEvent(
      request.contractAddress,
      request.eventTypeId,
      request.serializedEvent,
      request.eventCommitment,
      request.txHash,
      request.recipient,
    ),
  );

  await Promise.all([...noteDeliveries, ...eventDeliveries]);

  // Requests are cleared once we're done.
  await capsuleDataProvider.setCapsuleArray(contractAddress, noteValidationRequestsArrayBaseSlot, []);
  await capsuleDataProvider.setCapsuleArray(contractAddress, eventValidationRequestsArrayBaseSlot, []);
}
