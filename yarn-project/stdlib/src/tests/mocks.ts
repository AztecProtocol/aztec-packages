import {
  MAX_ENQUEUED_CALLS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PROCESSABLE_L2_GAS,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_TX_DA_GAS,
  MAX_TX_LIFETIME,
  PRIVATE_TX_L2_GAS_OVERHEAD,
  PUBLIC_TX_L2_GAS_OVERHEAD,
  TX_DA_GAS_OVERHEAD,
} from '@aztec/constants';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { type TypedDataDefinition, hashTypedData } from 'viem';

import type { ContractArtifact } from '../abi/abi.js';
import { PublicTxEffect } from '../avm/avm.js';
import type { AvmAccumulatedData } from '../avm/avm_accumulated_data.js';
import { AvmCircuitPublicInputs } from '../avm/avm_circuit_public_inputs.js';
import { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { AztecAddress } from '../aztec-address/index.js';
import { L2Block } from '../block/index.js';
import type { CommitteeAttestationsAndSigners } from '../block/proposal/attestations_and_signers.js';
import { Checkpoint } from '../checkpoint/checkpoint.js';
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
import { computeInHashFromL1ToL2Messages } from '../messaging/in_hash.js';
import { InboxBucketRef } from '../messaging/inbox_bucket.js';
import { BlockProposal } from '../p2p/block_proposal.js';
import { CheckpointAttestation } from '../p2p/checkpoint_attestation.js';
import { CheckpointProposal } from '../p2p/checkpoint_proposal.js';
import { ConsensusPayload } from '../p2p/consensus_payload.js';
import { type CoordinationSignatureContext, getHashedSignaturePayloadTypedData } from '../p2p/signature_utils.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
import { ProvingRequestType } from '../proofs/proving_request_type.js';
import { CheckpointHeader } from '../rollup/checkpoint_header.js';
import { AppendOnlyTreeSnapshot } from '../trees/append_only_tree_snapshot.js';
import {
  BlockHeader,
  GlobalVariables,
  HashedValues,
  PrivateCallExecutionResult,
  PrivateExecutionResult,
  ProtocolContracts,
  Tx,
  TxConstantData,
  makeProcessedTxFromPrivateOnlyTx,
  makeProcessedTxFromTxWithPublicCalls,
} from '../tx/index.js';
import { NestedProcessReturnValues, PublicSimulationOutput } from '../tx/public_simulation_output.js';
import { TxSimulationResult } from '../tx/simulated_tx.js';
import { TxEffect } from '../tx/tx_effect.js';
import { TxHash } from '../tx/tx_hash.js';
import { DEV_VERSION } from '../update-checker/dev_version.js';
import {
  makeAvmCircuitInputs,
  makeAztecAddress,
  makeBlockHeader,
  makeCheckpointHeader,
  makeGas,
  makeGlobalVariables,
  makePrivateToPublicAccumulatedData,
  makePrivateToRollupAccumulatedData,
  makeProtocolContracts,
  makePublicCallRequest,
  makePublicDataWrite,
} from './factories.js';

export const TEST_COORDINATION_SIGNATURE_CONTEXT: CoordinationSignatureContext = {
  chainId: 31337,
  rollupAddress: EthAddress.fromNumber(1),
};

function signTypedData(signer: Secp256k1Signer, typedData: TypedDataDefinition): Signature {
  return signer.sign(Buffer32.fromString(hashTypedData(typedData)));
}

export const randomTxHash = (): TxHash => TxHash.random();

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
    gasLimits = new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
    maxFeesPerGas = new GasFees(10, 10),
    maxPriorityFeesPerGas,
    gasUsed = Gas.empty(),
    chainId = Fr.ZERO,
    version = Fr.ZERO,
    vkTreeRoot = Fr.ZERO,
    protocolContractsHash = Fr.ZERO,
    anchorBlockHeader = BlockHeader.empty(),
  }: {
    numberOfNonRevertiblePublicCallRequests?: number;
    numberOfRevertiblePublicCallRequests?: number;
    numberOfRevertibleNullifiers?: number;
    hasPublicTeardownCallRequest?: boolean;
    publicCalldataSize?: number;
    feePayer?: AztecAddress;
    chonkProof?: ChonkProof;
    gasLimits?: Gas;
    maxFeesPerGas?: GasFees;
    maxPriorityFeesPerGas?: GasFees;
    gasUsed?: Gas;
    chainId?: Fr;
    version?: Fr;
    vkTreeRoot?: Fr;
    protocolContractsHash?: Fr;
    anchorBlockHeader?: BlockHeader;
  } = {},
) => {
  const totalPublicCallRequests =
    numberOfNonRevertiblePublicCallRequests +
    numberOfRevertiblePublicCallRequests +
    (hasPublicTeardownCallRequest ? 1 : 0);
  const isForPublic = totalPublicCallRequests > 0;
  const data = PrivateKernelTailCircuitPublicInputs.empty();
  const firstNullifier = new Nullifier(new Fr(seed + 1), Fr.ZERO, 0);
  data.constants.anchorBlockHeader = anchorBlockHeader;
  data.constants.txContext.gasSettings = GasSettings.fallback({ gasLimits, maxFeesPerGas, maxPriorityFeesPerGas });
  data.feePayer = feePayer ?? (await AztecAddress.random());
  data.gasUsed = gasUsed;
  data.constants.txContext.chainId = chainId;
  data.constants.txContext.version = version;
  data.constants.vkTreeRoot = vkTreeRoot;
  data.constants.protocolContractsHash = protocolContractsHash;

  // Set expirationTimestamp to the maximum allowed duration from the current time.
  data.expirationTimestamp = BigInt(Math.floor(Date.now() / 1000) + MAX_TX_LIFETIME);

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
  gasSettings = GasSettings.fallback({
    gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
    maxFeesPerGas: new GasFees(10, 10),
  }),
  vkTreeRoot = Fr.ZERO,
  protocolContracts = makeProtocolContracts(seed + 0x100),
  globalVariables = GlobalVariables.empty(),
  newL1ToL2Snapshot = AppendOnlyTreeSnapshot.empty(),
  feePayer,
  feePaymentPublicDataWrite,
  // The default gasUsed is the tx overhead.
  privateOnly = false,
  gasUsed = Gas.from({
    daGas: TX_DA_GAS_OVERHEAD,
    l2Gas: privateOnly ? PRIVATE_TX_L2_GAS_OVERHEAD : PUBLIC_TX_L2_GAS_OVERHEAD,
  }),
  avmAccumulatedData,
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
  avmAccumulatedData?: Partial<FieldsOf<AvmAccumulatedData>>;
} & Parameters<typeof mockTx>[1] = {}) {
  seed *= 0x1000; // Avoid clashing with the previous mock values if seed only increases by 1.
  anchorBlockHeader ??= db?.getInitialHeader() ?? makeBlockHeader(seed);
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
    avmOutput.accumulatedData.noteHashes = avmAccumulatedData?.noteHashes ?? revertibleData.noteHashes;
    avmOutput.accumulatedData.nullifiers =
      avmAccumulatedData?.nullifiers ??
      padArrayEnd(
        nonRevertibleData.nullifiers.concat(revertibleData.nullifiers).filter(n => !n.isEmpty()),
        Fr.ZERO,
        MAX_NULLIFIERS_PER_TX,
      );
    avmOutput.accumulatedData.l2ToL1Msgs = avmAccumulatedData?.l2ToL1Msgs ?? revertibleData.l2ToL1Msgs;
    avmOutput.accumulatedData.publicDataWrites =
      avmAccumulatedData?.publicDataWrites ??
      makeTuple(
        MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        i => (i === 0 ? feePaymentPublicDataWrite : new PublicDataWrite(new Fr(i), new Fr(i + 10))),
        seed + 0x2000,
      );
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

    const publicTxEffect = new PublicTxEffect(
      avmOutput.transactionFee,
      avmOutput.accumulatedData.noteHashes.filter(h => !h.isZero()),
      avmOutput.accumulatedData.nullifiers.filter(h => !h.isZero()),
      avmOutput.accumulatedData.l2ToL1Msgs.filter(h => !h.isEmpty()),
      avmOutput.accumulatedData.publicLogs.toLogs(),
      avmOutput.accumulatedData.publicDataWrites.filter(h => !h.isEmpty()),
    );

    return makeProcessedTxFromTxWithPublicCalls(
      tx,
      globalVariables,
      {
        type: ProvingRequestType.PUBLIC_VM,
        inputs: avmCircuitInputs,
      },
      publicTxEffect,
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

export function mockL1ToL2Messages(numL1ToL2Messages: number): Fr[] {
  return Array.from({ length: numL1ToL2Messages }, () => Fr.random());
}

export async function mockCheckpointAndMessages(
  checkpointNumber: CheckpointNumber,
  {
    startBlockNumber = BlockNumber(1),
    numBlocks = 1,
    blocks,
    numTxsPerBlock = 1,
    numL1ToL2Messages = 1,
    makeBlockOptions = () => ({}),
    previousArchive,
    maxEffects,
    ...options
  }: {
    startBlockNumber?: BlockNumber;
    numBlocks?: number;
    numTxsPerBlock?: number;
    numL1ToL2Messages?: number;
    makeBlockOptions?: (blockNumber: BlockNumber) => Partial<Parameters<typeof L2Block.random>[1]>;
    previousArchive?: AppendOnlyTreeSnapshot;
    blocks?: L2Block[];
    maxEffects?: number;
  } & Partial<Parameters<typeof Checkpoint.random>[1]> &
    Partial<Parameters<typeof L2Block.random>[1]> = {},
) {
  const slotNumber = options.slotNumber ?? SlotNumber(Number(checkpointNumber) * 10);
  const globals = GlobalVariables.random({ slotNumber, ...options });
  const blocksAndMessages = [];

  // Track the previous block's archive to ensure consecutive blocks have consistent archive roots.
  // The current block's header.lastArchive must equal the previous block's archive.
  let lastArchive: AppendOnlyTreeSnapshot | undefined = previousArchive;

  // Pass maxEffects via txOptions so it reaches TxEffect.random
  const txOptions = maxEffects !== undefined ? { maxEffects } : {};
  for (let i = 0; i < (blocks?.length ?? numBlocks); i++) {
    const blockNumber = BlockNumber(startBlockNumber + i);
    const { block, messages } = {
      block:
        blocks?.[i] ??
        (await L2Block.random(blockNumber, {
          ...globals,
          checkpointNumber,
          indexWithinCheckpoint: IndexWithinCheckpoint(i),
          txsPerBlock: numTxsPerBlock,
          txOptions,
          ...options,
          ...makeBlockOptions(blockNumber),
          ...(lastArchive ? { lastArchive } : {}),
        })),
      messages: mockL1ToL2Messages(numL1ToL2Messages),
    };
    // Update lastArchive for the next block
    lastArchive = block.archive;
    blocksAndMessages.push({ block, messages });
  }

  const messages = blocksAndMessages[0].messages;
  const inHash = computeInHashFromL1ToL2Messages(messages);
  const firstBlockLastArchive = blocksAndMessages[0].block.header.lastArchive;
  const checkpoint = await Checkpoint.random(checkpointNumber, {
    numBlocks: 0,
    inHash,
    ...options,
    ...globals,
    lastArchive: firstBlockLastArchive,
    lastArchiveRoot: firstBlockLastArchive.root,
    archive: lastArchive,
  });

  checkpoint.blocks = blocksAndMessages.map(({ block }) => block);

  // Return lastArchive so callers can chain it across multiple checkpoints
  return { checkpoint, messages, lastArchive };
}

export const randomContractArtifact = (): ContractArtifact => ({
  name: randomBytes(4).toString('hex'),
  aztecVersion: DEV_VERSION,
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
  header?: CheckpointHeader;
  archive?: Fr;
  txHashes?: TxHash[];
  txs?: Tx[];
  feeAssetPriceModifier?: bigint;
  signatureContext?: CoordinationSignatureContext;
}

export interface MakeBlockProposalOptions {
  signer?: Secp256k1Signer;
  blockHeader?: BlockHeader;
  indexWithinCheckpoint?: IndexWithinCheckpoint;
  inHash?: Fr;
  archiveRoot?: Fr;
  txHashes?: TxHash[];
  txs?: Tx[];
  signatureContext?: CoordinationSignatureContext;
  bucketRef?: InboxBucketRef;
}

export interface MakeCheckpointProposalOptions {
  signer?: Secp256k1Signer;
  checkpointHeader?: CheckpointHeader;
  archiveRoot?: Fr;
  feeAssetPriceModifier?: bigint;
  signatureContext?: CoordinationSignatureContext;
  /** Options for the lastBlock - if undefined, no lastBlock is included */
  lastBlock?: {
    blockHeader?: BlockHeader;
    indexWithinCheckpoint?: IndexWithinCheckpoint;
    txHashes?: TxHash[];
    txs?: Tx[];
    bucketRef?: InboxBucketRef;
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const makeAndSignConsensusPayload = (options?: MakeConsensusPayloadOptions) => {
  const header = options?.header ?? makeCheckpointHeader(1);
  const { signer = Secp256k1Signer.random(), archive = Fr.random(), feeAssetPriceModifier = 0n } = options ?? {};

  const payload = ConsensusPayload.fromFields({
    header,
    archive,
    feeAssetPriceModifier,
    signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
  });

  const hash = getHashedSignaturePayloadTypedData(payload);
  const signature = signer.sign(hash);

  return { blockNumber: header.slotNumber, payload, signature };
};

export const makeAndSignCommitteeAttestationsAndSigners = (
  attestationsAndSigners: CommitteeAttestationsAndSigners,
  signer: Secp256k1Signer = Secp256k1Signer.random(),
) => {
  const hash = getHashedSignaturePayloadTypedData(attestationsAndSigners);
  return signer.sign(hash);
};

export const makeBlockProposal = (options?: MakeBlockProposalOptions): Promise<BlockProposal> => {
  const blockHeader = options?.blockHeader ?? makeBlockHeader(1);
  const indexWithinCheckpoint = options?.indexWithinCheckpoint ?? IndexWithinCheckpoint(0);
  const inHash = options?.inHash ?? Fr.random();
  const archiveRoot = options?.archiveRoot ?? Fr.random();
  const txHashes = options?.txHashes ?? [0, 1, 2, 3, 4, 5].map(() => TxHash.random());
  const txs = options?.txs;
  const signer = options?.signer ?? Secp256k1Signer.random();
  const signatureContext = options?.signatureContext ?? TEST_COORDINATION_SIGNATURE_CONTEXT;
  const bucketRef = options?.bucketRef;

  return BlockProposal.createProposalFromSigner(
    blockHeader,
    CheckpointNumber(1),
    indexWithinCheckpoint,
    inHash,
    archiveRoot,
    txHashes,
    txs,
    signatureContext,
    (typedData, _context) => Promise.resolve(signTypedData(signer, typedData)),
    (typedData, _context) => Promise.resolve(signTypedData(signer, typedData)),
    bucketRef,
  );
};

export const makeCheckpointProposal = async (options?: MakeCheckpointProposalOptions): Promise<CheckpointProposal> => {
  const checkpointHeader = options?.checkpointHeader ?? makeCheckpointHeader(1);
  const archiveRoot = options?.archiveRoot ?? Fr.random();
  const feeAssetPriceModifier = options?.feeAssetPriceModifier ?? 0n;
  const signer = options?.signer ?? Secp256k1Signer.random();
  const signatureContext = options?.signatureContext ?? TEST_COORDINATION_SIGNATURE_CONTEXT;

  // Build a signed block proposal if lastBlock options are provided
  const lastBlockProposal = options?.lastBlock
    ? await makeBlockProposal({
        blockHeader: options.lastBlock.blockHeader,
        indexWithinCheckpoint: options.lastBlock.indexWithinCheckpoint ?? IndexWithinCheckpoint(4),
        inHash: checkpointHeader.inHash,
        archiveRoot,
        txHashes: options.lastBlock.txHashes,
        txs: options.lastBlock.txs,
        signer,
        signatureContext,
        bucketRef: options.lastBlock.bucketRef,
      })
    : undefined;

  return CheckpointProposal.createProposalFromSigner(
    checkpointHeader,
    archiveRoot,
    CheckpointNumber(1),
    feeAssetPriceModifier,
    lastBlockProposal,
    signatureContext,
    typedData => Promise.resolve(signTypedData(signer, typedData)),
  );
};

/**
 * Options for creating a checkpoint attestation
 */
export type MakeCheckpointAttestationOptions = {
  header?: CheckpointHeader;
  archive?: Fr;
  feeAssetPriceModifier?: bigint;
  attesterSigner?: Secp256k1Signer;
  proposerSigner?: Secp256k1Signer;
  signer?: Secp256k1Signer;
  signatureContext?: CoordinationSignatureContext;
};

/**
 * Create a checkpoint attestation for testing
 */
export const makeCheckpointAttestation = (options: MakeCheckpointAttestationOptions = {}): CheckpointAttestation => {
  const header = options.header ?? makeCheckpointHeader(1);
  const archive = options.archive ?? Fr.random();
  const feeAssetPriceModifier = options.feeAssetPriceModifier ?? 0n;
  const signatureContext = options.signatureContext ?? TEST_COORDINATION_SIGNATURE_CONTEXT;
  const { signer, attesterSigner = signer, proposerSigner = signer } = options;

  const payload = new ConsensusPayload(header, archive, feeAssetPriceModifier, signatureContext);

  // Sign as attester
  const attestationHash = getHashedSignaturePayloadTypedData(payload);
  const attestationSigner = attesterSigner ?? Secp256k1Signer.random();
  const attestationSignature = attestationSigner.sign(attestationHash);

  // Sign as proposer - use CheckpointProposal's payload format (serializeToBuffer)
  // This is different from ConsensusPayload's format (ABI encoding)
  const proposalSignerToUse = proposerSigner ?? Secp256k1Signer.random();
  const tempProposal = new CheckpointProposal(
    header,
    archive,
    feeAssetPriceModifier,
    Signature.empty(),
    signatureContext,
  );
  const proposalHash = getHashedSignaturePayloadTypedData(tempProposal);
  const proposerSignature = proposalSignerToUse.sign(proposalHash);

  return new CheckpointAttestation(payload, attestationSignature, proposerSignature);
};

/**
 * Create a checkpoint attestation from a checkpoint proposal
 */
export const makeCheckpointAttestationFromProposal = (
  proposal: CheckpointProposal,
  attesterSigner?: Secp256k1Signer,
): CheckpointAttestation => {
  const payload = new ConsensusPayload(
    proposal.checkpointHeader,
    proposal.archive,
    proposal.feeAssetPriceModifier,
    proposal.signatureContext,
  );

  // Sign as attester
  const attestationHash = getHashedSignaturePayloadTypedData(payload);
  const attestationSigner = attesterSigner ?? Secp256k1Signer.random();
  const attestationSignature = attestationSigner.sign(attestationHash);

  // Use the proposal's signature as the proposer signature
  return new CheckpointAttestation(payload, attestationSignature, proposal.signature);
};

/**
 * Create a checkpoint attestation from a checkpoint
 */
export const makeCheckpointAttestationFromCheckpoint = (
  checkpoint: Checkpoint,
  attesterSigner?: Secp256k1Signer,
  proposerSigner?: Secp256k1Signer,
): CheckpointAttestation => {
  const header = checkpoint.header;
  const archive = checkpoint.archive.root;
  const feeAssetPriceModifier = checkpoint.feeAssetPriceModifier;

  return makeCheckpointAttestation({ header, archive, feeAssetPriceModifier, attesterSigner, proposerSigner });
};

/**
 * Create a checkpoint attestation from an L2Block
 * Note: This is a compatibility function for tests. L2Block doesn't have a checkpoint header directly.
 */
export const makeCheckpointAttestationFromBlock = (
  block: L2Block,
  attesterSigner?: Secp256k1Signer,
  proposerSigner?: Secp256k1Signer,
): CheckpointAttestation => {
  // For L2Block, we create a minimal checkpoint header for testing purposes
  const header = CheckpointHeader.empty({
    lastArchiveRoot: block.header.lastArchive.root,
    slotNumber: block.slot,
    timestamp: block.timestamp,
    blockHeadersHash: Fr.ZERO, // Would need to compute from block header hash
  });
  const archive = block.archive.root;

  return makeCheckpointAttestation({ header, archive, attesterSigner, proposerSigner });
};
