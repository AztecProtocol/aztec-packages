import { Body } from '@aztec/aztec.js/block';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import type { P2P } from '@aztec/p2p';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { CommitteeAttestation, L2BlockNew } from '@aztec/stdlib/block';
import { BlockAttestation, BlockProposal, ConsensusPayload } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeAppendOnlyTreeSnapshot, mockTxForRollup } from '@aztec/stdlib/testing';
import {
  BlockHeader,
  ContentCommitment,
  GlobalVariables,
  type Tx,
  makeProcessedTxFromPrivateOnlyTx,
} from '@aztec/stdlib/tx';

import type { MockProxy } from 'jest-mock-extended';

// Re-export mock classes from their dedicated file
export { MockCheckpointBuilder, MockCheckpointsBuilder } from './mock_checkpoint_builder.js';

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
 * Creates an L2BlockNew from transactions and global variables
 */
export async function makeBlock(txs: Tx[], globalVariables: GlobalVariables): Promise<L2BlockNew> {
  const processedTxs = await Promise.all(
    txs.map(tx =>
      makeProcessedTxFromPrivateOnlyTx(tx, Fr.ZERO, new PublicDataWrite(Fr.random(), Fr.random()), globalVariables),
    ),
  );
  const body = new Body(processedTxs.map(tx => tx.txEffect));
  const header = BlockHeader.empty({ globalVariables });
  const archive = makeAppendOnlyTreeSnapshot(globalVariables.blockNumber + 1);
  return new L2BlockNew(archive, header, body, CheckpointNumber(globalVariables.blockNumber), 0);
}

/**
 * Mocks the P2P client to return specific pending transactions
 */
export function mockPendingTxs(p2p: MockProxy<P2P>, txs: Tx[]): void {
  p2p.getPendingTxCount.mockResolvedValue(txs.length);
  p2p.iteratePendingTxs.mockImplementation(() => mockTxIterator(Promise.resolve(txs)));
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
 * Creates a CheckpointHeader from an L2BlockNew for testing purposes.
 * Uses mock values for contentCommitment and blockHeadersHash since
 * L2BlockNew doesn't have these fields.
 */
function createCheckpointHeaderFromBlock(block: L2BlockNew): CheckpointHeader {
  const gv = block.header.globalVariables;
  return new CheckpointHeader(
    block.header.lastArchive.root,
    Fr.random(), // blockHeadersHash - mock value for testing
    ContentCommitment.empty(), // contentCommitment - mock value for testing
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
export function createBlockProposal(block: L2BlockNew, signature: Signature): BlockProposal {
  const checkpointHeader = createCheckpointHeaderFromBlock(block);
  const consensusPayload = new ConsensusPayload(checkpointHeader, block.archive.root);
  const txHashes = block.body.txEffects.map(tx => tx.txHash);
  return new BlockProposal(consensusPayload, signature, txHashes);
}

/**
 * Creates a block attestation from a block and signature.
 * Note: We manually set the sender since we use random signatures in tests.
 * In production, the sender is recovered from the signature.
 */
export function createBlockAttestation(block: L2BlockNew, signature: Signature, sender: EthAddress): BlockAttestation {
  const checkpointHeader = createCheckpointHeaderFromBlock(block);
  const consensusPayload = new ConsensusPayload(checkpointHeader, block.archive.root);
  const attestation = new BlockAttestation(consensusPayload, signature, signature);
  // Set sender directly for testing (bypasses signature recovery)

  (attestation as any).sender = sender;
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
): Promise<{ txs: Tx[]; block: L2BlockNew }> {
  const txs = await Promise.all(times(txCount, i => makeTx(i + 1, chainId)));
  const block = await makeBlock(txs, globalVariables);
  mockPendingTxs(p2p, txs);
  return { txs, block };
}
