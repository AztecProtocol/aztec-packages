import {
  AztecAddress,
  CallContext,
  ClientIvcProof,
  type ContractInstanceWithAddress,
  EthAddress,
  GasFees,
  GasSettings,
  MAX_ENQUEUED_CALLS_PER_TX,
  Nullifier,
  PartialPrivateTailPublicInputsForPublic,
  PrivateCircuitPublicInputs,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedDataBuilder,
  SerializableContractInstance,
  computeContractAddressFromInstance,
  computeContractClassId,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { makeCombinedConstantData, makeGas, makePublicCallRequest } from '@aztec/circuits.js/testing';
import { type ContractArtifact, NoteSelector } from '@aztec/foundation/abi';
import { times } from '@aztec/foundation/collection';
import { randomBigInt, randomBytes, randomInt } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';

import { ContractClassTxL2Logs, Note, UnencryptedTxL2Logs } from './logs/index.js';
import { ExtendedNote, UniqueNote } from './notes/index.js';
import {
  CountedPublicExecutionRequest,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
} from './private_execution_result.js';
import { EpochProofQuote } from './prover_coordination/epoch_proof_quote.js';
import { EpochProofQuotePayload } from './prover_coordination/epoch_proof_quote_payload.js';
import { PublicExecutionRequest } from './public_execution_request.js';
import { PublicSimulationOutput, Tx, TxHash, TxSimulationResult, accumulatePrivateReturnValues } from './tx/index.js';
import { TxEffect } from './tx_effect.js';

export const randomTxHash = (): TxHash => TxHash.random();

export const mockPrivateCallExecutionResult = (
  seed = 1,
  numberOfNonRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
  numberOfRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
  hasPublicTeardownCallRequest = false,
) => {
  const totalPublicCallRequests =
    numberOfNonRevertiblePublicCallRequests +
    numberOfRevertiblePublicCallRequests +
    (hasPublicTeardownCallRequest ? 1 : 0);
  const isForPublic = totalPublicCallRequests > 0;
  let enqueuedPublicFunctionCalls: PublicExecutionRequest[] = [];
  let publicTeardownFunctionCall = PublicExecutionRequest.empty();
  if (isForPublic) {
    const publicCallRequests = times(totalPublicCallRequests, i => makePublicCallRequest(seed + 0x102 + i)).reverse(); // Reverse it so that they are sorted by counters in descending order.
    const publicFunctionArgs = times(totalPublicCallRequests, i => [new Fr(seed + i * 100), new Fr(seed + i * 101)]);
    publicCallRequests.forEach((r, i) => (r.argsHash = computeVarArgsHash(publicFunctionArgs[i])));

    if (hasPublicTeardownCallRequest) {
      const request = publicCallRequests.shift()!;
      const args = publicFunctionArgs.shift()!;
      publicTeardownFunctionCall = new PublicExecutionRequest(CallContext.fromFields(request.toFields()), args);
    }

    enqueuedPublicFunctionCalls = publicCallRequests.map(
      (r, i) => new PublicExecutionRequest(CallContext.fromFields(r.toFields()), publicFunctionArgs[i]),
    );
  }
  return new PrivateCallExecutionResult(
    Buffer.from(''),
    Buffer.from(''),
    new Map(),
    PrivateCircuitPublicInputs.empty(),
    new Map(),
    [],
    new Map(),
    [],
    [],
    enqueuedPublicFunctionCalls.map((call, index) => new CountedPublicExecutionRequest(call, index)),
    publicTeardownFunctionCall,
    [],
  );
};

export const mockPrivateExecutionResult = (seed = 1) => {
  return new PrivateExecutionResult(mockPrivateCallExecutionResult(seed), true);
};

export const mockTx = (
  seed = 1,
  {
    numberOfNonRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    numberOfRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    hasPublicTeardownCallRequest = false,
    feePayer = AztecAddress.ZERO,
  }: {
    numberOfNonRevertiblePublicCallRequests?: number;
    numberOfRevertiblePublicCallRequests?: number;
    hasPublicTeardownCallRequest?: boolean;
    feePayer?: AztecAddress;
  } = {},
) => {
  const totalPublicCallRequests =
    numberOfNonRevertiblePublicCallRequests +
    numberOfRevertiblePublicCallRequests +
    (hasPublicTeardownCallRequest ? 1 : 0);
  const isForPublic = totalPublicCallRequests > 0;
  const data = PrivateKernelTailCircuitPublicInputs.empty();
  const firstNullifier = new Nullifier(new Fr(seed + 1), 0, Fr.ZERO);
  data.constants.txContext.gasSettings = GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) });
  data.feePayer = feePayer;

  let enqueuedPublicFunctionCalls: PublicExecutionRequest[] = [];
  let publicTeardownFunctionCall = PublicExecutionRequest.empty();
  if (!isForPublic) {
    data.forRollup!.end.nullifiers[0] = firstNullifier.value;
  } else {
    data.forRollup = undefined;
    data.forPublic = PartialPrivateTailPublicInputsForPublic.empty();

    const revertibleBuilder = new PrivateToPublicAccumulatedDataBuilder();
    const nonRevertibleBuilder = new PrivateToPublicAccumulatedDataBuilder();

    const publicCallRequests = times(totalPublicCallRequests, i => makePublicCallRequest(seed + 0x102 + i)).reverse(); // Reverse it so that they are sorted by counters in descending order.
    const publicFunctionArgs = times(totalPublicCallRequests, i => [new Fr(seed + i * 100), new Fr(seed + i * 101)]);
    publicCallRequests.forEach((r, i) => (r.argsHash = computeVarArgsHash(publicFunctionArgs[i])));

    if (hasPublicTeardownCallRequest) {
      const request = publicCallRequests.shift()!;
      data.forPublic.publicTeardownCallRequest = request;
      const args = publicFunctionArgs.shift()!;
      publicTeardownFunctionCall = new PublicExecutionRequest(CallContext.fromFields(request.toFields()), args);
    }

    enqueuedPublicFunctionCalls = publicCallRequests.map(
      (r, i) => new PublicExecutionRequest(CallContext.fromFields(r.toFields()), publicFunctionArgs[i]),
    );

    data.forPublic.nonRevertibleAccumulatedData = nonRevertibleBuilder
      .pushNullifier(firstNullifier.value)
      .withPublicCallRequests(publicCallRequests.slice(numberOfRevertiblePublicCallRequests))
      .build();

    data.forPublic.revertibleAccumulatedData = revertibleBuilder
      .withPublicCallRequests(publicCallRequests.slice(0, numberOfRevertiblePublicCallRequests))
      .build();
  }

  const tx = new Tx(
    data,
    ClientIvcProof.empty(),
    UnencryptedTxL2Logs.empty(),
    ContractClassTxL2Logs.empty(),
    enqueuedPublicFunctionCalls,
    publicTeardownFunctionCall,
  );

  return tx;
};

export const mockTxForRollup = (seed = 1) =>
  mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

export const mockSimulatedTx = (seed = 1) => {
  const privateExecutionResult = mockPrivateExecutionResult(seed);
  const tx = mockTx(seed);
  const output = new PublicSimulationOutput(
    undefined,
    makeCombinedConstantData(),
    TxEffect.random(),
    [accumulatePrivateReturnValues(privateExecutionResult)],
    {
      totalGas: makeGas(),
      teardownGas: makeGas(),
      publicGas: makeGas(),
    },
  );
  return new TxSimulationResult(privateExecutionResult, tx.data, output);
};

export const mockEpochProofQuote = (
  epochToProve: bigint,
  validUntilSlot?: bigint,
  bondAmount?: bigint,
  proverAddress?: EthAddress,
  basisPointFee?: number,
) => {
  const quotePayload: EpochProofQuotePayload = new EpochProofQuotePayload(
    epochToProve,
    validUntilSlot ?? randomBigInt(10000n),
    bondAmount ?? randomBigInt(10000n) + 1000n,
    proverAddress ?? EthAddress.random(),
    basisPointFee ?? randomInt(100),
  );
  const sig: Signature = Signature.empty();
  return new EpochProofQuote(quotePayload, sig);
};

export const randomContractArtifact = (): ContractArtifact => ({
  name: randomBytes(4).toString('hex'),
  functions: [],
  outputs: {
    structs: {},
    globals: {},
  },
  fileMap: {},
  storageLayout: {},
  notes: {},
});

export const randomContractInstanceWithAddress = (
  opts: { contractClassId?: Fr } = {},
  address?: AztecAddress,
): ContractInstanceWithAddress => {
  const instance = SerializableContractInstance.random(opts);
  return instance.withAddress(address ?? computeContractAddressFromInstance(instance));
};

export const randomDeployedContract = () => {
  const artifact = randomContractArtifact();
  const contractClassId = computeContractClassId(getContractClassFromArtifact(artifact));
  return { artifact, instance: randomContractInstanceWithAddress({ contractClassId }) };
};

export const randomExtendedNote = ({
  note = Note.random(),
  owner = AztecAddress.random(),
  contractAddress = AztecAddress.random(),
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = NoteSelector.random(),
}: Partial<ExtendedNote> = {}) => {
  return new ExtendedNote(note, owner, contractAddress, storageSlot, noteTypeId, txHash);
};

export const randomUniqueNote = ({
  note = Note.random(),
  owner = AztecAddress.random(),
  contractAddress = AztecAddress.random(),
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = NoteSelector.random(),
  nonce = Fr.random(),
}: Partial<UniqueNote> = {}) => {
  return new UniqueNote(note, owner, contractAddress, storageSlot, noteTypeId, txHash, nonce);
};
