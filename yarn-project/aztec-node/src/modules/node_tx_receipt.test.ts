import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { BlockHash, type L2BlockSource, type L2Tips } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { NullDebugLogStore } from '@aztec/stdlib/logs';
import { mockTx } from '@aztec/stdlib/testing';
import {
  DroppedTxReceipt,
  type IndexedTxEffect,
  MinedTxReceipt,
  PendingTxReceipt,
  TxEffect,
  TxExecutionResult,
  TxHash,
  TxStatus,
} from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { UpstreamTxGateway } from '../follower/upstream_tx_gateway.js';
import { NodeTxReceiptBuilder } from './node_tx_receipt.js';

/** Tips of a chain where every block up to 10 is checkpointed and nothing is proven. */
const makeTips = (): L2Tips => {
  const genesis = {
    block: { number: BlockNumber.ZERO, hash: `0x00` },
    checkpoint: { number: CheckpointNumber.ZERO, hash: `0x00` },
  };
  return {
    proposed: { number: BlockNumber(10), hash: `0x0a` },
    checkpointed: {
      block: { number: BlockNumber(10), hash: `0x0a` },
      checkpoint: { number: CheckpointNumber(1), hash: `0x01` },
    },
    proven: genesis,
    finalized: genesis,
  };
};

describe('NodeTxReceiptBuilder on a follower node', () => {
  let upstream: MockProxy<AztecNode>;
  let blockSource: MockProxy<L2BlockSource>;
  let builder: NodeTxReceiptBuilder;
  let txHash: TxHash;

  beforeEach(() => {
    upstream = mock<AztecNode>();
    blockSource = mock<L2BlockSource>();
    blockSource.getL2Tips.mockResolvedValue(makeTips());
    blockSource.getL1Constants.mockResolvedValue(EmptyL1RollupConstants);
    builder = new NodeTxReceiptBuilder({
      txGateway: new UpstreamTxGateway(upstream, { validateTxs: true }),
      blockSource,
      debugLogStore: new NullDebugLogStore(),
    });
    txHash = TxHash.random();
  });

  const indexedEffect = (blockNumber: BlockNumber): IndexedTxEffect => ({
    data: TxEffect.empty(),
    l2BlockNumber: blockNumber,
    l2BlockHash: BlockHash.random(),
    slotNumber: SlotNumber(Number(blockNumber)),
    txIndexInBlock: 0,
  });

  it('builds a mined receipt from the local archiver, ignoring the upstream', async () => {
    const indexed = indexedEffect(BlockNumber(9));
    blockSource.getTxEffect.mockResolvedValue(indexed);

    const receipt = await builder.getTxReceipt(txHash);

    expect(receipt).toBeInstanceOf(MinedTxReceipt);
    expect(receipt).toMatchObject({ status: TxStatus.CHECKPOINTED, blockNumber: BlockNumber(9) });
    expect(upstream.getTxReceipt).not.toHaveBeenCalled();
  });

  it('holds back mined status for a tx whose block is not replicated yet', async () => {
    blockSource.getTxEffect.mockResolvedValue(undefined);
    upstream.getTxReceipt.mockResolvedValue(
      new MinedTxReceipt(
        txHash,
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        0n,
        BlockHash.random(),
        BlockNumber(11),
        SlotNumber(11),
        0,
        EpochNumber(0),
        undefined,
      ),
    );

    const receipt = await builder.getTxReceipt(txHash);

    expect(receipt.status).toEqual(TxStatus.PENDING);
    expect(receipt).toBeInstanceOf(PendingTxReceipt);
  });

  it('reports a tx pending upstream as pending', async () => {
    blockSource.getTxEffect.mockResolvedValue(undefined);
    upstream.getTxReceipt.mockResolvedValue(new PendingTxReceipt(txHash, undefined));

    expect((await builder.getTxReceipt(txHash)).status).toEqual(TxStatus.PENDING);
  });

  it('attaches the pending tx fetched from the upstream when requested', async () => {
    const tx = await mockTx(1);
    blockSource.getTxEffect.mockResolvedValue(undefined);
    upstream.getTxReceipt.mockResolvedValue(new PendingTxReceipt(txHash, undefined));
    upstream.getTxByHash.mockResolvedValue(tx);

    const receipt = await builder.getTxReceipt(txHash, { includePendingTx: true });

    expect(receipt.tx).toBe(tx);
    expect(upstream.getTxByHash).toHaveBeenCalledWith(txHash, { includeProof: false });
  });

  it('reports a tx the upstream dropped as dropped', async () => {
    blockSource.getTxEffect.mockResolvedValue(undefined);
    upstream.getTxReceipt.mockResolvedValue(new DroppedTxReceipt(txHash, 'dropped'));

    const receipt = await builder.getTxReceipt(txHash);

    expect(receipt.status).toEqual(TxStatus.DROPPED);
    expect(receipt).toBeInstanceOf(DroppedTxReceipt);
  });
});
