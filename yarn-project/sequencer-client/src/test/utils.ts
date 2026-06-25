import { Body } from '@aztec/aztec.js/block';
import { CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import type { P2P } from '@aztec/p2p';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { CommitteeAttestation, L2Block } from '@aztec/stdlib/block';
import { DEFAULT_BLOCK_DURATION_MS } from '@aztec/stdlib/config';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import { BlockProposal, CheckpointAttestation, CheckpointProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
  makeAppendOnlyTreeSnapshot,
  mockTxForRollup,
} from '@aztec/stdlib/testing';
import {
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
  ProposerTimetable,
} from '@aztec/stdlib/timetable';
import { BlockHeader, GlobalVariables, type Tx, makeProcessedTxFromPrivateOnlyTx } from '@aztec/stdlib/tx';

import type { MockProxy } from 'jest-mock-extended';

// Re-export mock classes from their dedicated file
export { MockCheckpointBuilder, MockCheckpointsBuilder } from './mock_checkpoint_builder.js';

/**
 * Builds a {@link ProposerTimetable} for tests from a millisecond block duration and optional budgets,
 * filling unset budgets with the shared `DEFAULT_*` values the sequencer config layer applies. Mirrors how
 * the sequencer constructs its timetable so tests exercise the same budget resolution.
 */
export function makeProposerTimetable(opts: {
  l1Constants: Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'>;
  blockDurationMs?: number;
  minBlockDuration?: number;
  p2pPropagationTime?: number;
  checkpointProposalPrepareTime?: number;
}): ProposerTimetable {
  return new ProposerTimetable({
    l1Constants: opts.l1Constants,
    blockDuration: (opts.blockDurationMs ?? DEFAULT_BLOCK_DURATION_MS) / 1000,
    minBlockDuration: opts.minBlockDuration ?? DEFAULT_MIN_BLOCK_DURATION,
    p2pPropagationTime: opts.p2pPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME,
    checkpointProposalPrepareTime: opts.checkpointProposalPrepareTime ?? DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
    checkpointProposalInitTime: DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  });
}

/**
 * Creates a mock transaction with a specific seed for deterministic testing
 */
export async function makeTx(seed?: number, chainId?: Fr): Promise<Tx> {
  const tx = await mockTxForRollup(seed);
  if (chainId) {
    tx.data.constants.txContext.chainId = chainId;
  }
  return tx;
}

/**
 * Creates an L2Block from transactions and global variables
 */
export async function makeBlock(txs: Tx[], globalVariables: GlobalVariables): Promise<L2Block> {
  const processedTxs = await Promise.all(
    txs.map(tx =>
      makeProcessedTxFromPrivateOnlyTx(tx, Fr.ZERO, new PublicDataWrite(Fr.random(), Fr.random()), globalVariables),
    ),
  );
  const body = new Body(processedTxs.map(tx => tx.txEffect));
  const header = BlockHeader.empty({ globalVariables });
  const archive = makeAppendOnlyTreeSnapshot(globalVariables.blockNumber + 1);
  return new L2Block(
    archive,
    header,
    body,
    CheckpointNumber.fromBlockNumber(globalVariables.blockNumber),
    IndexWithinCheckpoint(0),
  );
}

/**
 * Mocks the P2P client to return specific pending transactions
 */
export function mockPendingTxs(p2p: MockProxy<P2P>, txs: Tx[]): void {
  p2p.getPendingTxCount.mockResolvedValue(txs.length);
  p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
  p2p.iterateEligiblePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
}

/**
 * Creates an async iterator for transactions
 */
export async function* mockTxIterator(txs: Promise<Tx[]>): AsyncIterableIterator<Tx> {
  for (const tx of await txs) {
    yield tx;
  }
}

/**
 * Creates mock committee attestations from a signer
 */
export function createMockSignatures(signer: Secp256k1Signer): CommitteeAttestation[] {
  const mockedSig = Signature.random();
  return [new CommitteeAttestation(signer.address, mockedSig)];
}

/**
 * Creates a CheckpointHeader from an L2Block for testing purposes.
 * Uses mock values for blockHeadersHash, blobsHash and inHash since L2Block doesn't have these fields.
 */
function createCheckpointHeaderFromBlock(block: L2Block): CheckpointHeader {
  const gv = block.header.globalVariables;
  return new CheckpointHeader(
    block.header.lastArchive.root,
    Fr.random(), // blockHeadersHash - mock value for testing
    Fr.random(), // blobsHash - mock value for testing
    Fr.random(), // inHash - mock value for testing
    Fr.random(), // outHash - mock value for testing
    gv.slotNumber,
    gv.timestamp,
    gv.coinbase,
    gv.feeRecipient,
    gv.gasFees,
    block.header.totalManaUsed,
  );
}

/**
 * Creates a block proposal from a block and signature
 */
export function createBlockProposal(block: L2Block, signature: Signature): BlockProposal {
  const txHashes = block.body.txEffects.map(tx => tx.txHash);
  return new BlockProposal(
    block.header,
    block.indexWithinCheckpoint,
    Fr.ZERO, // inHash - using zero for testing
    block.archive.root,
    txHashes,
    signature,
    TEST_COORDINATION_SIGNATURE_CONTEXT,
  );
}

/**
 * Creates a checkpoint proposal from a block and signature
 */
export function createCheckpointProposal(
  block: L2Block,
  checkpointSignature: Signature,
  blockSignature?: Signature,
  feeAssetPriceModifier: bigint = 0n,
): CheckpointProposal {
  const txHashes = block.body.txEffects.map(tx => tx.txHash);
  const checkpointHeader = createCheckpointHeaderFromBlock(block);
  return new CheckpointProposal(
    checkpointHeader,
    block.archive.root,
    feeAssetPriceModifier,
    checkpointSignature,
    TEST_COORDINATION_SIGNATURE_CONTEXT,
    {
      blockHeader: block.header,
      indexWithinCheckpoint: block.indexWithinCheckpoint,
      txHashes,
      signature: blockSignature ?? checkpointSignature, // Use checkpoint signature as block signature if not provided
    },
  );
}

/**
 * Creates a checkpoint attestation from a block and signature.
 * Note: We manually set the sender since we use random signatures in tests.
 * In production, the sender is recovered from the signature.
 */
export function createCheckpointAttestation(
  block: L2Block,
  signature: Signature,
  sender: EthAddress,
  feeAssetPriceModifier: bigint = 0n,
): CheckpointAttestation {
  const checkpointHeader = createCheckpointHeaderFromBlock(block);
  const payload = new ConsensusPayload(
    checkpointHeader,
    block.archive.root,
    feeAssetPriceModifier,
    TEST_COORDINATION_SIGNATURE_CONTEXT,
  );
  const attestation = new CheckpointAttestation(payload, signature, signature);
  // Bypass signature recovery for testing since we use random signatures
  (attestation as any).getSender = () => sender;
  (attestation as any).getProposer = () => sender;
  return attestation;
}

/**
 * Creates transactions and a block, and mocks P2P to return them.
 * Helper for tests that need to set up a block with transactions.
 */
export async function setupTxsAndBlock(
  p2p: MockProxy<P2P>,
  globalVariables: GlobalVariables,
  txCount: number,
  chainId: Fr,
): Promise<{ txs: Tx[]; block: L2Block }> {
  const txs = await Promise.all(times(txCount, i => makeTx(i + 1, chainId)));
  const block = await makeBlock(txs, globalVariables);
  mockPendingTxs(p2p, txs);
  return { txs, block };
}
