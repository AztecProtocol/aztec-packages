import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { BlockHash } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { mockTx } from '@aztec/stdlib/testing';
import {
  DroppedTxReceipt,
  MinedTxReceipt,
  PendingTxReceipt,
  type Tx,
  TxExecutionResult,
  TxHash,
  TxStatus,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { UpstreamTxGateway } from './upstream_tx_gateway.js';

describe('UpstreamTxGateway', () => {
  let upstream: MockProxy<AztecNode>;
  let gateway: UpstreamTxGateway;
  let txHash: TxHash;

  beforeEach(() => {
    upstream = mock<AztecNode>();
    gateway = new UpstreamTxGateway(upstream);
    txHash = TxHash.random();
  });

  const minedReceipt = () =>
    new MinedTxReceipt(
      txHash,
      TxStatus.CHECKPOINTED,
      TxExecutionResult.SUCCESS,
      0n,
      BlockHash.random(),
      BlockNumber(10),
      SlotNumber(10),
      0,
      EpochNumber(0),
      undefined,
    );

  it('does not validate txs locally', () => {
    expect(gateway.requiresLocalTxValidation).toBe(false);
  });

  it('forwards a tx to the upstream node verbatim', async () => {
    const tx: Tx = await mockTx(1);
    await gateway.sendTx(tx);
    expect(upstream.sendTx).toHaveBeenCalledWith(tx);
  });

  it('surfaces an upstream rejection to the caller', async () => {
    const tx: Tx = await mockTx(1);
    upstream.sendTx.mockRejectedValue(new Error('Invalid tx: insufficient fee payer balance'));
    await expect(gateway.sendTx(tx)).rejects.toThrow('insufficient fee payer balance');
  });

  it('proxies pending tx queries upstream', async () => {
    const txs: Tx[] = [await mockTx(1), await mockTx(2)];
    upstream.getPendingTxs.mockResolvedValue(txs);
    upstream.getPendingTxCount.mockResolvedValue(2);
    upstream.getTxByHash.mockResolvedValue(txs[0]);
    upstream.getTxsByHash.mockResolvedValue(txs);

    const after = TxHash.random();
    expect(await gateway.getPendingTxs(10, after, { includeProof: true })).toEqual(txs);
    expect(upstream.getPendingTxs).toHaveBeenCalledWith(10, after, { includeProof: true });
    expect(await gateway.getPendingTxCount()).toBe(2);
    expect(await gateway.getTxByHash(txHash)).toBe(txs[0]);
    expect(await gateway.getTxsByHash([txHash])).toEqual(txs);
  });

  it('proxies max priority fees upstream', async () => {
    const fees = GasFees.from({ feePerDaGas: 3n, feePerL2Gas: 7n });
    upstream.getMaxPriorityFees.mockResolvedValue(fees);
    expect(await gateway.getMaxPriorityFees()).toEqual(fees);
  });

  describe('hasUnminedTx', () => {
    it('reports a tx the upstream holds as pending', async () => {
      upstream.getTxReceipt.mockResolvedValue(new PendingTxReceipt(txHash, undefined));
      expect(await gateway.hasUnminedTx(txHash)).toBe(true);
    });

    it('reports a tx already mined upstream as still known, since its block is not replicated yet', async () => {
      upstream.getTxReceipt.mockResolvedValue(minedReceipt());
      expect(await gateway.hasUnminedTx(txHash)).toBe(true);
    });

    it('reports a tx the upstream dropped as unknown', async () => {
      upstream.getTxReceipt.mockResolvedValue(new DroppedTxReceipt(txHash, 'dropped'));
      expect(await gateway.hasUnminedTx(txHash)).toBe(false);
    });
  });

  describe('p2p-only queries', () => {
    it('reports no peers and no enr of its own', async () => {
      expect(await gateway.getPeers()).toEqual([]);
      expect(await gateway.getEncodedEnr()).toBeUndefined();
      expect(upstream.getPeers).not.toHaveBeenCalled();
      expect(upstream.getEncodedEnr).not.toHaveBeenCalled();
    });

    it('reports no attestations and no proposals of its own', async () => {
      expect(await gateway.getCheckpointAttestationsForSlot(SlotNumber(1))).toEqual([]);
      expect(await gateway.getProposalsForSlot(SlotNumber(1))).toEqual({
        blockProposals: [],
        checkpointProposals: [],
      });
      expect(upstream.getCheckpointAttestationsForSlot).not.toHaveBeenCalled();
      expect(upstream.getProposalsForSlot).not.toHaveBeenCalled();
    });
  });

  it('has no local state to update, clear or stop', async () => {
    await expect(gateway.updateConfig({ realProofs: true })).resolves.toBeUndefined();
    await expect(gateway.clear()).resolves.toBeUndefined();
    await expect(gateway.stop()).resolves.toBeUndefined();
  });
});
