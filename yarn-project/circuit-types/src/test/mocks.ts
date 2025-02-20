import {
  AztecAddress,
  type BlockHeader,
  CallContext,
  ClientIvcProof,
  type ContractInstanceWithAddress,
  GasFees,
  GasSettings,
  Nullifier,
  PrivateCircuitPublicInputs,
  SerializableContractInstance,
  computeContractAddressFromInstance,
  getContractClassFromArtifact,
} from '@aztec/circuits.js';
import { type ContractArtifact, NoteSelector } from '@aztec/circuits.js/abi';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
  PrivateToPublicAccumulatedDataBuilder,
} from '@aztec/circuits.js/kernel';
import { makeCombinedConstantData, makeGas, makeHeader, makePublicCallRequest } from '@aztec/circuits.js/testing';
import { MAX_ENQUEUED_CALLS_PER_TX } from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { Note } from '../logs/index.js';
import { ExtendedNote, UniqueNote } from '../notes/index.js';
import { BlockAttestation } from '../p2p/block_attestation.js';
import { BlockProposal } from '../p2p/block_proposal.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import {
  CountedPublicExecutionRequest,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
} from '../private_execution_result.js';
import { PublicExecutionRequest } from '../public_execution_request.js';
import { PublicSimulationOutput, Tx, TxHash, TxSimulationResult, accumulatePrivateReturnValues } from '../tx/index.js';
import { TxEffect } from '../tx_effect.js';

export const randomTxHash = (): TxHash => TxHash.random();

export const mockPrivateCallExecutionResult = async (
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
    for (let i = 0; i < publicCallRequests.length; i++) {
      const r = publicCallRequests[i];
      r.argsHash = await computeVarArgsHash(publicFunctionArgs[i]);
      i++;
    }

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

export const mockPrivateExecutionResult = async (seed = 1) => {
  return new PrivateExecutionResult(await mockPrivateCallExecutionResult(seed), Fr.zero());
};

export const mockTx = async (
  seed = 1,
  {
    numberOfNonRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    numberOfRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    hasPublicTeardownCallRequest = false,
    feePayer,
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
  data.feePayer = feePayer ?? (await AztecAddress.random());

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
    for (let i = 0; i < publicCallRequests.length; i++) {
      const r = publicCallRequests[i];
      r.argsHash = await computeVarArgsHash(publicFunctionArgs[i]);
    }

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

  const tx = new Tx(data, ClientIvcProof.empty(), [], enqueuedPublicFunctionCalls, publicTeardownFunctionCall);

  return tx;
};

export const mockTxForRollup = (seed = 1) =>
  mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

export const mockSimulatedTx = async (seed = 1) => {
  const privateExecutionResult = await mockPrivateExecutionResult(seed);
  const tx = await mockTx(seed);
  const output = new PublicSimulationOutput(
    undefined,
    makeCombinedConstantData(),
    await TxEffect.random(),
    [accumulatePrivateReturnValues(privateExecutionResult)],
    {
      totalGas: makeGas(),
      teardownGas: makeGas(),
      publicGas: makeGas(),
      billedGas: makeGas(),
    },
  );
  return new TxSimulationResult(privateExecutionResult, tx.data, output);
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

export const randomContractInstanceWithAddress = async (
  opts: { contractClassId?: Fr } = {},
  address?: AztecAddress,
): Promise<ContractInstanceWithAddress> => {
  const instance = await SerializableContractInstance.random(
    opts.contractClassId
      ? {
          currentContractClassId: opts.contractClassId,
          originalContractClassId: opts.contractClassId,
        }
      : undefined,
  );
  return instance.withAddress(address ?? (await computeContractAddressFromInstance(instance)));
};

export const randomDeployedContract = async () => {
  const artifact = randomContractArtifact();
  const { id: contractClassId } = await getContractClassFromArtifact(artifact);
  return { artifact, instance: await randomContractInstanceWithAddress({ contractClassId }) };
};

export const randomExtendedNote = async ({
  note = Note.random(),
  owner = undefined,
  contractAddress = undefined,
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = NoteSelector.random(),
}: Partial<ExtendedNote> = {}) => {
  return new ExtendedNote(
    note,
    owner ?? (await AztecAddress.random()),
    contractAddress ?? (await AztecAddress.random()),
    storageSlot,
    noteTypeId,
    txHash,
  );
};

export const randomUniqueNote = async ({
  note = Note.random(),
  owner = undefined,
  contractAddress = undefined,
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteTypeId = NoteSelector.random(),
  nonce = Fr.random(),
}: Partial<UniqueNote> = {}) => {
  return new UniqueNote(
    note,
    owner ?? (await AztecAddress.random()),
    contractAddress ?? (await AztecAddress.random()),
    storageSlot,
    noteTypeId,
    txHash,
    nonce,
  );
};

export interface MakeConsensusPayloadOptions {
  signer?: Secp256k1Signer;
  header?: BlockHeader;
  archive?: Fr;
  txHashes?: TxHash[];
}

const makeAndSignConsensusPayload = async (
  domainSeparator: SignatureDomainSeparator,
  options?: MakeConsensusPayloadOptions,
) => {
  const {
    signer = Secp256k1Signer.random(),
    header = makeHeader(1),
    archive = Fr.random(),
    txHashes = [0, 1, 2, 3, 4, 5].map(() => TxHash.random()),
  } = options ?? {};

  const payload = ConsensusPayload.fromFields({
    header,
    archive,
    txHashes,
  });

  const hash = await getHashedSignaturePayloadEthSignedMessage(payload, domainSeparator);
  const signature = signer.sign(hash);

  return { payload, signature };
};

export const makeBlockProposal = async (options?: MakeConsensusPayloadOptions): Promise<BlockProposal> => {
  const { payload, signature } = await makeAndSignConsensusPayload(SignatureDomainSeparator.blockProposal, options);
  return new BlockProposal(payload, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = async (options?: MakeConsensusPayloadOptions): Promise<BlockAttestation> => {
  const { payload, signature } = await makeAndSignConsensusPayload(SignatureDomainSeparator.blockAttestation, options);
  return new BlockAttestation(payload, signature);
};
