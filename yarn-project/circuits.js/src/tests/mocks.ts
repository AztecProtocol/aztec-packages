import { MAX_ENQUEUED_CALLS_PER_TX } from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import type { ContractArtifact } from '../abi/abi.js';
import { NoteSelector } from '../abi/note_selector.js';
import { AztecAddress } from '../aztec-address/index.js';
import { computeContractAddressFromInstance } from '../contract/contract_address.js';
import { getContractClassFromArtifact } from '../contract/contract_class.js';
import { SerializableContractInstance } from '../contract/contract_instance.js';
import type { ContractInstanceWithAddress } from '../contract/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { GasSettings } from '../gas/gas_settings.js';
import { computeVarArgsHash } from '../hash/hash.js';
import { Nullifier } from '../kernel/nullifier.js';
import { PrivateCircuitPublicInputs } from '../kernel/private_circuit_public_inputs.js';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
} from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { PrivateToPublicAccumulatedDataBuilder } from '../kernel/private_to_public_accumulated_data_builder.js';
import { ContractClassTxL2Logs } from '../logs/index.js';
import { ExtendedNote, UniqueNote } from '../note/extended_note.js';
import { Note } from '../note/note.js';
import { BlockAttestation } from '../p2p/block_attestation.js';
import { BlockProposal } from '../p2p/block_proposal.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import {
  BlockHeader,
  CallContext,
  CountedPublicExecutionRequest,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  PublicExecutionRequest,
  Tx,
} from '../tx/index.js';
import { PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { TxSimulationResult, accumulatePrivateReturnValues } from '../tx/simulated_tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { makeCombinedConstantData, makeGas, makeHeader, makePublicCallRequest } from './factories.js';

export const randomTxHash = (): TxHash => TxHash.random();

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

  const tx = new Tx(
    data,
    ClientIvcProof.empty(),
    ContractClassTxL2Logs.empty(),
    enqueuedPublicFunctionCalls,
    publicTeardownFunctionCall,
  );

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
