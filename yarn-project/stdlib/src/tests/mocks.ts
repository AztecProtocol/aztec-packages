import { MAX_ENQUEUED_CALLS_PER_TX } from '@aztec/constants';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer, randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import type { ContractArtifact } from '../abi/abi.js';
import { AztecAddress } from '../aztec-address/index.js';
import { computeContractAddressFromInstance } from '../contract/contract_address.js';
import { getContractClassFromArtifact } from '../contract/contract_class.js';
import { SerializableContractInstance } from '../contract/contract_instance.js';
import type { ContractInstanceWithAddress } from '../contract/index.js';
import { GasFees } from '../gas/gas_fees.js';
import { GasSettings } from '../gas/gas_settings.js';
import { Nullifier } from '../kernel/nullifier.js';
import { PrivateCircuitPublicInputs } from '../kernel/private_circuit_public_inputs.js';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
} from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { PrivateToPublicAccumulatedDataBuilder } from '../kernel/private_to_public_accumulated_data_builder.js';
import { ExtendedNote, UniqueNote } from '../note/extended_note.js';
import { Note } from '../note/note.js';
import { BlockAttestation } from '../p2p/block_attestation.js';
import { BlockProposal } from '../p2p/block_proposal.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import { ClientIvcProof } from '../proofs/client_ivc_proof.js';
import { BlockHeader, HashedValues, PrivateCallExecutionResult, PrivateExecutionResult, Tx } from '../tx/index.js';
import { PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { TxSimulationResult, accumulatePrivateReturnValues } from '../tx/simulated_tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { makeCombinedConstantData, makeGas, makeHeader, makePublicCallRequest } from './factories.js';

export const randomTxHash = (): TxHash => TxHash.random();

export const randomExtendedNote = async ({
  note = Note.random(),
  recipient = undefined,
  contractAddress = undefined,
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
}: Partial<ExtendedNote> = {}) => {
  return new ExtendedNote(
    note,
    recipient ?? (await AztecAddress.random()),
    contractAddress ?? (await AztecAddress.random()),
    storageSlot,
    txHash,
  );
};

export const randomUniqueNote = async ({
  note = Note.random(),
  recipient = undefined,
  contractAddress = undefined,
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  nonce = Fr.random(),
}: Partial<UniqueNote> = {}) => {
  return new UniqueNote(
    note,
    recipient ?? (await AztecAddress.random()),
    contractAddress ?? (await AztecAddress.random()),
    storageSlot,
    txHash,
    nonce,
  );
};

export const mockTx = async (
  seed = 1,
  {
    numberOfNonRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    numberOfRevertiblePublicCallRequests = MAX_ENQUEUED_CALLS_PER_TX / 2,
    numberOfRevertibleNullifiers = 0,
    hasPublicTeardownCallRequest = false,
    publicCalldataSize = 2,
    feePayer,
    clientIvcProof = ClientIvcProof.empty(),
    maxPriorityFeesPerGas,
  }: {
    numberOfNonRevertiblePublicCallRequests?: number;
    numberOfRevertiblePublicCallRequests?: number;
    numberOfRevertibleNullifiers?: number;
    hasPublicTeardownCallRequest?: boolean;
    publicCalldataSize?: number;
    feePayer?: AztecAddress;
    clientIvcProof?: ClientIvcProof;
    maxPriorityFeesPerGas?: GasFees;
  } = {},
) => {
  const totalPublicCallRequests =
    numberOfNonRevertiblePublicCallRequests +
    numberOfRevertiblePublicCallRequests +
    (hasPublicTeardownCallRequest ? 1 : 0);
  const isForPublic = totalPublicCallRequests > 0;
  const data = PrivateKernelTailCircuitPublicInputs.empty();
  const firstNullifier = new Nullifier(new Fr(seed + 1), 0, Fr.ZERO);
  data.constants.txContext.gasSettings = GasSettings.default({
    maxFeesPerGas: new GasFees(10, 10),
    maxPriorityFeesPerGas,
  });
  data.feePayer = feePayer ?? (await AztecAddress.random());

  const publicFunctionCalldata: HashedValues[] = [];
  if (!isForPublic) {
    data.forRollup!.end.nullifiers[0] = firstNullifier.value;
  } else {
    data.forRollup = undefined;
    data.forPublic = PartialPrivateTailPublicInputsForPublic.empty();

    const revertibleBuilder = new PrivateToPublicAccumulatedDataBuilder();
    const nonRevertibleBuilder = new PrivateToPublicAccumulatedDataBuilder();

    const publicCallRequests = times(totalPublicCallRequests, i => makePublicCallRequest(seed + 0x102 + i));
    const calldata = times(totalPublicCallRequests, i => times(publicCalldataSize, j => new Fr(seed + (i * 13 + j))));
    for (let i = 0; i < publicCallRequests.length; i++) {
      const hashedCalldata = await HashedValues.fromCalldata(calldata[i]);
      publicFunctionCalldata.push(hashedCalldata);
      publicCallRequests[i].calldataHash = hashedCalldata.hash;
    }

    if (hasPublicTeardownCallRequest) {
      data.forPublic.publicTeardownCallRequest = publicCallRequests.pop()!;
    }

    data.forPublic.nonRevertibleAccumulatedData = nonRevertibleBuilder
      .pushNullifier(firstNullifier.value)
      .withPublicCallRequests(publicCallRequests.slice(numberOfRevertiblePublicCallRequests))
      .build();

    for (let i = 0; i < numberOfRevertibleNullifiers; i++) {
      const revertibleNullifier = new Nullifier(new Fr(seed + 2 + i), 0, Fr.ZERO);
      revertibleBuilder.pushNullifier(revertibleNullifier.value);
    }

    data.forPublic.revertibleAccumulatedData = revertibleBuilder
      .withPublicCallRequests(publicCallRequests.slice(0, numberOfRevertiblePublicCallRequests))
      .build();
  }

  return new Tx(data, clientIvcProof, [], publicFunctionCalldata);
};

export const mockTxForRollup = (seed = 1) =>
  mockTx(seed, { numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

const emptyPrivateCallExecutionResult = () =>
  new PrivateCallExecutionResult(
    Buffer.from(''),
    Buffer.from(''),
    new Map(),
    PrivateCircuitPublicInputs.empty(),
    new Map(),
    [],
    new Map(),
    [],
    [],
    [],
  );

const emptyPrivateExecutionResult = () => new PrivateExecutionResult(emptyPrivateCallExecutionResult(), Fr.zero(), []);

export const mockSimulatedTx = async (seed = 1) => {
  const privateExecutionResult = emptyPrivateExecutionResult();
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
  nonDispatchPublicFunctions: [],
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

const makeAndSignConsensusPayload = (
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

  const hash = getHashedSignaturePayloadEthSignedMessage(payload, domainSeparator);
  const signature = signer.sign(hash);

  return { payload, signature };
};

export const makeBlockProposal = (options?: MakeConsensusPayloadOptions): BlockProposal => {
  const { payload, signature } = makeAndSignConsensusPayload(SignatureDomainSeparator.blockProposal, options);
  return new BlockProposal(payload, signature);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = (options?: MakeConsensusPayloadOptions): BlockAttestation => {
  const { payload, signature } = makeAndSignConsensusPayload(SignatureDomainSeparator.blockAttestation, options);
  return new BlockAttestation(payload, signature);
};
