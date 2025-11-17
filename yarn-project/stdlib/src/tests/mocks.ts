import {
  FIXED_DA_GAS,
  FIXED_L2_GAS,
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_INCLUDE_BY_TIMESTAMP_DURATION,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { Buffer32 } from '@aztec/foundation/buffer';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { Secp256k1Signer, randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import type { ContractArtifact } from '../abi/abi.js';
import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { AztecAddress } from '../aztec-address/index.js';
import { CommitteeAttestation, L1PublishedData, L2BlockHeader } from '../block/index.js';
import { L2Block } from '../block/l2_block.js';
import type { CommitteeAttestationsAndSigners } from '../block/proposal/attestations_and_signers.js';
import { PublishedL2Block } from '../block/published_l2_block.js';
import { computeContractAddressFromInstance } from '../contract/contract_address.js';
import { getContractClassFromArtifact } from '../contract/contract_class.js';
import { SerializableContractInstance } from '../contract/contract_instance.js';
import type { ContractInstanceWithAddress } from '../contract/index.js';
import { computeEffectiveGasFees } from '../fees/transaction_fee.js';
import { Gas } from '../gas/gas.js';
import { GasFees } from '../gas/gas_fees.js';
import { GasSettings } from '../gas/gas_settings.js';
import type { GasUsed } from '../gas/gas_used.js';
import type { MerkleTreeReadOperations } from '../interfaces/merkle_tree_operations.js';
import { Nullifier } from '../kernel/nullifier.js';
import { PrivateCircuitPublicInputs } from '../kernel/private_circuit_public_inputs.js';
import {
  PartialPrivateTailPublicInputsForPublic,
  PrivateKernelTailCircuitPublicInputs,
} from '../kernel/private_kernel_tail_circuit_public_inputs.js';
import { PrivateToAvmAccumulatedData } from '../kernel/private_to_avm_accumulated_data.js';
import { PrivateToPublicAccumulatedDataBuilder } from '../kernel/private_to_public_accumulated_data_builder.js';
import { PublicCallRequestArrayLengths } from '../kernel/public_call_request.js';
import { Note } from '../note/note.js';
import { UniqueNote } from '../note/unique_note.js';
import { BlockAttestation } from '../p2p/block_attestation.js';
import { BlockProposal } from '../p2p/block_proposal.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { SignatureDomainSeparator, getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import {
  BlockHeader,
  GlobalVariables,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  ProtocolContracts,
  StateReference,
  Tx,
  TxConstantData,
  makeProcessedTxFromPrivateOnlyTx,
  makeProcessedTxFromTxWithPublicCalls,
} from '../tx/index.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { TxSimulationResult } from '../tx/simulated_tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import {
  makeAvmCircuitInputs,
  makeAztecAddress,
  makeGas,
  makeGlobalVariables,
  makeHeader,
  makeL2BlockHeader,
  makePrivateToPublicAccumulatedData,
  makePrivateToRollupAccumulatedData,
  makeProtocolContracts,
  makePublicCallRequest,
  makePublicDataWrite,
} from './factories.js';

export const randomTxHash = (): TxHash => TxHash.random();

export const randomUniqueNote = async ({
  note = Note.random(),
  recipient = undefined,
  contractAddress = undefined,
  txHash = randomTxHash(),
  storageSlot = Fr.random(),
  noteNonce = Fr.random(),
}: Partial<UniqueNote> = {}) => {
  return new UniqueNote(
    note,
    recipient ?? (await AztecAddress.random()),
    contractAddress ?? (await AztecAddress.random()),
    storageSlot,
    txHash,
    noteNonce,
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
    chonkProof = ChonkProof.random(),
    maxPriorityFeesPerGas,
    gasUsed = Gas.empty(),
    chainId = Fr.ZERO,
    version = Fr.ZERO,
    vkTreeRoot = Fr.ZERO,
    protocolContractsHash = Fr.ZERO,
  }: {
    numberOfNonRevertiblePublicCallRequests?: number;
    numberOfRevertiblePublicCallRequests?: number;
    numberOfRevertibleNullifiers?: number;
    hasPublicTeardownCallRequest?: boolean;
    publicCalldataSize?: number;
    feePayer?: AztecAddress;
    chonkProof?: ChonkProof;
    maxPriorityFeesPerGas?: GasFees;
    gasUsed?: Gas;
    chainId?: Fr;
    version?: Fr;
    vkTreeRoot?: Fr;
    protocolContractsHash?: Fr;
  } = {},
) => {
  const totalPublicCallRequests =
    numberOfNonRevertiblePublicCallRequests +
    numberOfRevertiblePublicCallRequests +
    (hasPublicTeardownCallRequest ? 1 : 0);
  const isForPublic = totalPublicCallRequests > 0;
  const data = PrivateKernelTailCircuitPublicInputs.empty();
  const firstNullifier = new Nullifier(new Fr(seed + 1), Fr.ZERO, 0);
  data.constants.txContext.gasSettings = GasSettings.default({
    maxFeesPerGas: new GasFees(10, 10),
    maxPriorityFeesPerGas,
  });
  data.feePayer = feePayer ?? (await AztecAddress.random());
  data.gasUsed = gasUsed;
  data.constants.txContext.chainId = chainId;
  data.constants.txContext.version = version;
  data.constants.vkTreeRoot = vkTreeRoot;
  data.constants.protocolContractsHash = protocolContractsHash;

  // Set includeByTimestamp to the maximum allowed duration from the current time.
  data.includeByTimestamp = BigInt(Math.floor(Date.now() / 1000) + MAX_INCLUDE_BY_TIMESTAMP_DURATION);

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
      const revertibleNullifier = new Nullifier(new Fr(seed + 2 + i), Fr.ZERO, 0);
      revertibleBuilder.pushNullifier(revertibleNullifier.value);
    }

    data.forPublic.revertibleAccumulatedData = revertibleBuilder
      .withPublicCallRequests(publicCallRequests.slice(0, numberOfRevertiblePublicCallRequests))
      .build();
  }

  return await Tx.create({
    data,
    chonkProof,
    contractClassLogFields: [],
    publicFunctionCalldata,
  });
};

export const mockTxForRollup = (seed = 1, opts: Parameters<typeof mockTx>[1] = {}) =>
  mockTx(seed, { ...opts, numberOfNonRevertiblePublicCallRequests: 0, numberOfRevertiblePublicCallRequests: 0 });

/** Mock a processed tx for testing purposes. */
export async function mockProcessedTx({
  seed = 1,
  anchorBlockHeader,
  db,
  chainId = Fr.ZERO,
  version = Fr.ZERO,
  gasSettings = GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
  vkTreeRoot = Fr.ZERO,
  protocolContracts = makeProtocolContracts(seed + 0x100),
  globalVariables = GlobalVariables.empty(),
  newL1ToL2Snapshot = AppendOnlyTreeSnapshot.empty(),
  feePayer,
  feePaymentPublicDataWrite,
  // The default gasUsed is the tx overhead.
  gasUsed = Gas.from({ daGas: FIXED_DA_GAS, l2Gas: FIXED_L2_GAS }),
  privateOnly = false,
  ...mockTxOpts
}: {
  seed?: number;
  anchorBlockHeader?: BlockHeader;
  db?: MerkleTreeReadOperations;
  gasSettings?: GasSettings;
  globalVariables?: GlobalVariables;
  newL1ToL2Snapshot?: AppendOnlyTreeSnapshot;
  protocolContracts?: ProtocolContracts;
  feePaymentPublicDataWrite?: PublicDataWrite;
  privateOnly?: boolean;
} & Parameters<typeof mockTx>[1] = {}) {
  seed *= 0x1000; // Avoid clashing with the previous mock values if seed only increases by 1.
  anchorBlockHeader ??= db?.getInitialHeader() ?? makeHeader(seed);
  feePayer ??= makeAztecAddress(seed + 0x100);
  feePaymentPublicDataWrite ??= makePublicDataWrite(seed + 0x200);

  const txConstantData = TxConstantData.empty();
  txConstantData.anchorBlockHeader = anchorBlockHeader;
  txConstantData.txContext.chainId = chainId;
  txConstantData.txContext.version = version;
  txConstantData.txContext.gasSettings = gasSettings;
  txConstantData.vkTreeRoot = vkTreeRoot;
  txConstantData.protocolContractsHash = await protocolContracts.hash();

  const tx = !privateOnly
    ? await mockTx(seed, { feePayer, gasUsed, ...mockTxOpts })
    : await mockTx(seed, {
        numberOfNonRevertiblePublicCallRequests: 0,
        numberOfRevertiblePublicCallRequests: 0,
        feePayer,
        gasUsed,
        ...mockTxOpts,
      });
  tx.data.constants = txConstantData;

  const transactionFee = tx.data.gasUsed.computeFee(globalVariables.gasFees);

  if (privateOnly) {
    const data = makePrivateToRollupAccumulatedData(seed + 0x1000, { numContractClassLogs: 0 });

    tx.data.forRollup!.end = data;

    await tx.recomputeHash();
    return makeProcessedTxFromPrivateOnlyTx(tx, transactionFee, feePaymentPublicDataWrite, globalVariables);
  } else {
    const dataFromPrivate = tx.data.forPublic!;

    const nonRevertibleData = dataFromPrivate.nonRevertibleAccumulatedData;

    // Create revertible data.
    const revertibleData = makePrivateToPublicAccumulatedData(seed + 0x1000, { numContractClassLogs: 0 });
    revertibleData.nullifiers[MAX_NULLIFIERS_PER_TX - 1] = Fr.ZERO; // Leave one space for the tx hash nullifier in nonRevertibleAccumulatedData.
    dataFromPrivate.revertibleAccumulatedData = revertibleData;

    // Create avm output.
    const avmOutput = AvmCircuitPublicInputs.empty();
    // Assign data from hints.
    avmOutput.protocolContracts = protocolContracts;
    avmOutput.startTreeSnapshots.l1ToL2MessageTree = newL1ToL2Snapshot;
    avmOutput.endTreeSnapshots.l1ToL2MessageTree = newL1ToL2Snapshot;
    avmOutput.effectiveGasFees = computeEffectiveGasFees(globalVariables.gasFees, gasSettings);
    // Assign data from private.
    avmOutput.globalVariables = globalVariables;
    avmOutput.startGasUsed = tx.data.gasUsed;
    avmOutput.gasSettings = gasSettings;
    avmOutput.feePayer = feePayer;
    avmOutput.publicCallRequestArrayLengths = new PublicCallRequestArrayLengths(
      tx.data.numberOfNonRevertiblePublicCallRequests(),
      tx.data.numberOfRevertiblePublicCallRequests(),
      tx.data.hasTeardownPublicCallRequest(),
    );
    avmOutput.publicSetupCallRequests = dataFromPrivate.nonRevertibleAccumulatedData.publicCallRequests;
    avmOutput.publicAppLogicCallRequests = dataFromPrivate.revertibleAccumulatedData.publicCallRequests;
    avmOutput.publicTeardownCallRequest = dataFromPrivate.publicTeardownCallRequest;
    avmOutput.previousNonRevertibleAccumulatedData = new PrivateToAvmAccumulatedData(
      dataFromPrivate.nonRevertibleAccumulatedData.noteHashes,
      dataFromPrivate.nonRevertibleAccumulatedData.nullifiers,
      dataFromPrivate.nonRevertibleAccumulatedData.l2ToL1Msgs,
    );
    avmOutput.previousNonRevertibleAccumulatedDataArrayLengths =
      avmOutput.previousNonRevertibleAccumulatedData.getArrayLengths();
    avmOutput.previousRevertibleAccumulatedData = new PrivateToAvmAccumulatedData(
      dataFromPrivate.revertibleAccumulatedData.noteHashes,
      dataFromPrivate.revertibleAccumulatedData.nullifiers,
      dataFromPrivate.revertibleAccumulatedData.l2ToL1Msgs,
    );
    avmOutput.previousRevertibleAccumulatedDataArrayLengths =
      avmOutput.previousRevertibleAccumulatedData.getArrayLengths();
    // Assign final data emitted from avm.
    avmOutput.accumulatedData.noteHashes = revertibleData.noteHashes;
    avmOutput.accumulatedData.nullifiers = padArrayEnd(
      nonRevertibleData.nullifiers.concat(revertibleData.nullifiers).filter(n => !n.isEmpty()),
      Fr.ZERO,
      MAX_NULLIFIERS_PER_TX,
    );
    avmOutput.accumulatedData.l2ToL1Msgs = revertibleData.l2ToL1Msgs;
    avmOutput.accumulatedData.publicDataWrites = makeTuple(
      MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
      i => new PublicDataWrite(new Fr(i), new Fr(i + 10)),
      seed + 0x2000,
    );
    avmOutput.accumulatedData.publicDataWrites[0] = feePaymentPublicDataWrite;
    avmOutput.accumulatedDataArrayLengths = avmOutput.accumulatedData.getArrayLengths();
    avmOutput.gasSettings = gasSettings;
    // Note: The fee is computed from the tx's gas used, which only includes the gas used in private. But this shouldn't
    // be a problem for the tests.
    avmOutput.transactionFee = transactionFee;

    const avmCircuitInputs = await makeAvmCircuitInputs(seed + 0x3000, { publicInputs: avmOutput });
    avmCircuitInputs.hints.startingTreeRoots.l1ToL2MessageTree = newL1ToL2Snapshot;

    const gasUsed = {
      totalGas: Gas.empty(),
      teardownGas: Gas.empty(),
      publicGas: Gas.empty(),
      billedGas: Gas.empty(),
    } satisfies GasUsed;

    await tx.recomputeHash();
    return makeProcessedTxFromTxWithPublicCalls(
      tx,
      {
        type: ProvingRequestType.PUBLIC_VM,
        inputs: avmCircuitInputs,
      },
      gasUsed,
      RevertCode.OK,
      undefined /* revertReason */,
    );
  }
}

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
    [],
    [],
  );

const emptyPrivateExecutionResult = () => new PrivateExecutionResult(emptyPrivateCallExecutionResult(), Fr.zero(), []);

export const mockSimulatedTx = async (seed = 1) => {
  const privateExecutionResult = emptyPrivateExecutionResult();
  const tx = await mockTx(seed);
  const output = new PublicSimulationOutput(
    undefined,
    makeGlobalVariables(),
    await TxEffect.random(),
    times(2, () => NestedProcessReturnValues.random(2)),
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
  attesterSigner?: Secp256k1Signer;
  proposerSigner?: Secp256k1Signer;
  header?: L2BlockHeader;
  archive?: Fr;
  stateReference?: StateReference;
  txHashes?: TxHash[];
  txs?: Tx[];
}

const makeAndSignConsensusPayload = (
  domainSeparator: SignatureDomainSeparator,
  options?: MakeConsensusPayloadOptions,
) => {
  const header = options?.header ?? makeL2BlockHeader(1);
  const { signer = Secp256k1Signer.random(), archive = Fr.random(), stateReference = header.state } = options ?? {};

  const payload = ConsensusPayload.fromFields({
    header: header.toCheckpointHeader(),
    archive,
    stateReference,
  });

  const hash = getHashedSignaturePayloadEthSignedMessage(payload, domainSeparator);
  const signature = signer.sign(hash);

  return { blockNumber: header.globalVariables.blockNumber, payload, signature };
};

export const makeAndSignCommitteeAttestationsAndSigners = (
  attestationsAndSigners: CommitteeAttestationsAndSigners,
  signer: Secp256k1Signer = Secp256k1Signer.random(),
) => {
  const hash = getHashedSignaturePayloadEthSignedMessage(
    attestationsAndSigners,
    SignatureDomainSeparator.attestationsAndSigners,
  );
  return signer.sign(hash);
};

export const makeBlockProposal = (options?: MakeConsensusPayloadOptions): BlockProposal => {
  const { payload, signature } = makeAndSignConsensusPayload(SignatureDomainSeparator.blockProposal, options);
  const txHashes = options?.txHashes ?? [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
  return new BlockProposal(payload, signature, txHashes, options?.txs ?? []);
};

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/8028)
export const makeBlockAttestation = (options?: MakeConsensusPayloadOptions): BlockAttestation => {
  const header = options?.header ?? makeL2BlockHeader(1);
  const {
    signer,
    attesterSigner = signer ?? Secp256k1Signer.random(),
    proposerSigner = signer ?? Secp256k1Signer.random(),
    archive = Fr.random(),
    stateReference = header.state,
  } = options ?? {};

  const payload = ConsensusPayload.fromFields({
    header: header.toCheckpointHeader(),
    archive,
    stateReference,
  });

  // Sign as attester
  const attestationHash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockAttestation);
  const attestationSignature = attesterSigner.sign(attestationHash);

  // Sign as proposer
  const proposalHash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockProposal);
  const proposerSignature = proposerSigner.sign(proposalHash);

  return new BlockAttestation(payload, attestationSignature, proposerSignature);
};

export const makeBlockAttestationFromBlock = (
  block: L2Block,
  attesterSigner?: Secp256k1Signer,
  proposerSigner?: Secp256k1Signer,
): BlockAttestation => {
  const header = block.header;
  const archive = block.archive.root;
  const stateReference = block.header.state;

  const payload = ConsensusPayload.fromFields({
    header: header.toCheckpointHeader(),
    archive,
    stateReference,
  });

  // Sign as attester
  const attestationHash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockAttestation);
  const attestationSigner = attesterSigner ?? Secp256k1Signer.random();
  const attestationSignature = attestationSigner.sign(attestationHash);

  // Sign as proposer
  const proposalHash = getHashedSignaturePayloadEthSignedMessage(payload, SignatureDomainSeparator.blockProposal);
  const proposalSignerToUse = proposerSigner ?? Secp256k1Signer.random();
  const proposerSignature = proposalSignerToUse.sign(proposalHash);

  return new BlockAttestation(payload, attestationSignature, proposerSignature);
};

export async function randomPublishedL2Block(
  l2BlockNumber: number,
  opts: { signers?: Secp256k1Signer[] } = {},
): Promise<PublishedL2Block> {
  const block = await L2Block.random(l2BlockNumber);
  const l1 = L1PublishedData.fromFields({
    blockNumber: BigInt(block.number),
    timestamp: block.header.globalVariables.timestamp,
    blockHash: Buffer32.random().toString(),
  });

  const signers = opts.signers ?? times(3, () => Secp256k1Signer.random());
  const atts = await Promise.all(signers.map(signer => makeBlockAttestationFromBlock(block, signer)));
  const attestations = atts.map(
    (attestation, i) => new CommitteeAttestation(signers[i].address, attestation.signature),
  );
  return new PublishedL2Block(block, l1, attestations);
}
