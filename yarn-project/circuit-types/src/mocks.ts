import {
  AztecAddress,
  CallRequest,
  Fr,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  Proof,
  SideEffectLinkedToNoteHash,
} from '@aztec/circuits.js';
import { makePublicCallRequest } from '@aztec/circuits.js/testing';
import { ContractArtifact } from '@aztec/foundation/abi';
import { makeTuple } from '@aztec/foundation/array';
import { times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto';
import { to2Fields } from '@aztec/foundation/serialize';
import { ContractInstanceWithAddress, SerializableContractInstance } from '@aztec/types/contracts';

import { DeployedContract } from './interfaces/index.js';
import { FunctionL2Logs, Note, TxL2Logs } from './logs/index.js';
import { ExtendedNote } from './notes/index.js';
import { Tx, TxHash } from './tx/index.js';

/**
 * Testing utility to create empty logs composed from a single empty log.
 */
export function makeEmptyLogs(): TxL2Logs {
  const functionLogs = [new FunctionL2Logs([Buffer.alloc(0)])];
  return new TxL2Logs(functionLogs);
}

export const randomTxHash = (): TxHash => new TxHash(randomBytes(32));

export const mockTx = (
  seed = 1,
  {
    hasLogs = false,
    numberOfNonRevertiblePublicCallRequests = MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX / 2,
    numberOfRevertiblePublicCallRequests = MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX / 2,
  }: {
    hasLogs?: boolean;
    numberOfNonRevertiblePublicCallRequests?: number;
    numberOfRevertiblePublicCallRequests?: number;
  } = {},
) => {
  const totalPublicCallRequests = numberOfNonRevertiblePublicCallRequests + numberOfRevertiblePublicCallRequests;
  const publicCallRequests = times(totalPublicCallRequests, i => makePublicCallRequest(seed + 0x100 + i));

  const isForPublic = totalPublicCallRequests > 0;
  const data = PrivateKernelTailCircuitPublicInputs.empty();
  const firstNullifier = new SideEffectLinkedToNoteHash(new Fr(seed), new Fr(seed + 1), Fr.ZERO);

  if (isForPublic) {
    data.forRollup = undefined;
    data.forPublic = PartialPrivateTailPublicInputsForPublic.empty();

    data.forPublic.endNonRevertibleData.newNullifiers[0] = firstNullifier;

    data.forPublic.endNonRevertibleData.publicCallStack = makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, i =>
      i < numberOfNonRevertiblePublicCallRequests ? publicCallRequests[i].toCallRequest() : CallRequest.empty(),
    );

    data.forPublic.end.publicCallStack = makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, i =>
      i < numberOfRevertiblePublicCallRequests
        ? publicCallRequests[i + numberOfNonRevertiblePublicCallRequests].toCallRequest()
        : CallRequest.empty(),
    );
  } else {
    data.forRollup!.end.newNullifiers[0] = firstNullifier;
  }

  const target = isForPublic ? data.forPublic! : data.forRollup!;

  const encryptedLogs = hasLogs ? TxL2Logs.random(8, 3) : TxL2Logs.empty(); // 8 priv function invocations creating 3 encrypted logs each
  const unencryptedLogs = hasLogs ? TxL2Logs.random(11, 2) : TxL2Logs.empty(); // 8 priv function invocations creating 3 encrypted logs each
  if (!hasLogs) {
    target.end.encryptedLogsHash = [Fr.ZERO, Fr.ZERO];
    target.end.unencryptedLogsHash = [Fr.ZERO, Fr.ZERO];
  } else {
    target.end.encryptedLogsHash = to2Fields(encryptedLogs.hash());
    target.end.unencryptedLogsHash = to2Fields(encryptedLogs.hash());
  }

  const tx = new Tx(data, new Proof(Buffer.alloc(0)), encryptedLogs, unencryptedLogs, publicCallRequests);

  return tx;
};

export const mockTxForRollup = (seed = 1, { hasLogs = false }: { hasLogs?: boolean } = {}) =>
  mockTx(seed, { hasLogs, numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

export const randomContractArtifact = (): ContractArtifact => ({
  name: randomBytes(4).toString('hex'),
  functions: [],
  events: [],
  fileMap: {},
});

export const randomContractInstanceWithAddress = (): ContractInstanceWithAddress =>
  SerializableContractInstance.random().withAddress(AztecAddress.random());

export const randomDeployedContract = (): DeployedContract => ({
  artifact: randomContractArtifact(),
  instance: randomContractInstanceWithAddress(),
});

export const randomExtendedNote = ({
  note = Note.random(),
  owner = AztecAddress.random(),
  contractAddress = AztecAddress.random(),
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = Fr.random(),
}: Partial<ExtendedNote> = {}) => {
  return new ExtendedNote(note, owner, contractAddress, storageSlot, noteTypeId, txHash);
};
