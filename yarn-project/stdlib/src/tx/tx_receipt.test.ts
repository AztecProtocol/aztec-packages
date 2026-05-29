import { BlockNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { RevertCode } from '../avm/revert_code.js';
import { BlockHash } from '../block/block_hash.js';
import { ChonkProof } from '../proofs/chonk_proof.js';
import { mockTx } from '../tests/mocks.js';
import { TxEffect } from './tx_effect.js';
import { TxHash } from './tx_hash.js';
import {
  DroppedTxReceipt,
  MinedTxReceipt,
  PendingTxReceipt,
  TxExecutionResult,
  TxReceiptSchema,
  TxStatus,
} from './tx_receipt.js';

describe('TxReceipt', () => {
  describe('PendingTxReceipt', () => {
    it('constructs a bare pending receipt', () => {
      const receipt = new PendingTxReceipt(TxHash.random());
      expect(receipt.status).toEqual(TxStatus.PENDING);
      expect(receipt.isPending()).toBe(true);
      expect(receipt.isMined()).toBe(false);
      expect(receipt.isDropped()).toBe(false);
      expect(receipt.hasExecutionSucceeded()).toBe(false);
      expect(receipt.hasExecutionReverted()).toBe(false);
      expect(receipt.tx).toBeUndefined();
    });

    it('round-trips a bare pending receipt', () => {
      const receipt = new PendingTxReceipt(TxHash.random());
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(PendingTxReceipt);
      expect(parsed).toEqual(receipt);
    });

    it('round-trips a pending receipt with an attached tx', async () => {
      const receipt = new PendingTxReceipt(TxHash.random(), await mockTx());
      const parsed = await TxReceiptSchema.parseAsync(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(PendingTxReceipt);
      expect(parsed).toEqual(receipt);
    });

    it('round-trips a pending receipt with a stripped-proof tx', async () => {
      const receipt = new PendingTxReceipt(TxHash.random(), (await mockTx()).withoutProof());
      expect(receipt.tx!.chonkProof).toEqual(ChonkProof.empty());

      const parsed = await TxReceiptSchema.parseAsync(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(PendingTxReceipt);
      expect(parsed).toEqual(receipt);
      expect((parsed as PendingTxReceipt).tx!.chonkProof).toEqual(ChonkProof.empty());
    });

    it('empty() yields a pending receipt', () => {
      const receipt = PendingTxReceipt.empty();
      expect(receipt).toBeInstanceOf(PendingTxReceipt);
      expect(receipt.status).toEqual(TxStatus.PENDING);
    });
  });

  describe('DroppedTxReceipt', () => {
    it('constructs a dropped receipt with an error', () => {
      const receipt = new DroppedTxReceipt(TxHash.random(), 'Tx dropped by P2P node');
      expect(receipt.status).toEqual(TxStatus.DROPPED);
      expect(receipt.isDropped()).toBe(true);
      expect(receipt.isPending()).toBe(false);
      expect(receipt.isMined()).toBe(false);
      expect(receipt.hasExecutionSucceeded()).toBe(false);
      expect(receipt.hasExecutionReverted()).toBe(false);
      expect(receipt.error).toEqual('Tx dropped by P2P node');
    });

    it('round-trips a dropped receipt with an error', () => {
      const receipt = new DroppedTxReceipt(TxHash.random(), 'some error');
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(DroppedTxReceipt);
      expect(parsed).toEqual(receipt);
    });

    it('round-trips a dropped receipt without an error', () => {
      const receipt = new DroppedTxReceipt(TxHash.random());
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(DroppedTxReceipt);
      expect(parsed).toEqual(receipt);
    });

    it('empty() yields a dropped receipt', () => {
      const receipt = DroppedTxReceipt.empty();
      expect(receipt).toBeInstanceOf(DroppedTxReceipt);
      expect(receipt.status).toEqual(TxStatus.DROPPED);
    });
  });

  describe('MinedTxReceipt', () => {
    const makeMined = (status: MinedTxReceipt['status'], executionResult = TxExecutionResult.SUCCESS) =>
      new MinedTxReceipt(
        TxHash.random(),
        status,
        executionResult,
        1n,
        BlockHash.random(),
        BlockNumber(1),
        0,
        EpochNumber(3),
      );

    it('constructs a mined receipt with required fields', () => {
      const receipt = makeMined(TxStatus.PROVEN);
      expect(receipt.isMined()).toBe(true);
      expect(receipt.isPending()).toBe(false);
      expect(receipt.isDropped()).toBe(false);
      expect(receipt.hasExecutionSucceeded()).toBe(true);
      expect(receipt.hasExecutionReverted()).toBe(false);
    });

    it('delegates execution helpers to executionResult', () => {
      const reverted = makeMined(TxStatus.PROPOSED, TxExecutionResult.REVERTED);
      expect(reverted.hasExecutionSucceeded()).toBe(false);
      expect(reverted.hasExecutionReverted()).toBe(true);
    });

    it('executionResultFromRevertCode maps revert codes', () => {
      expect(MinedTxReceipt.executionResultFromRevertCode(RevertCode.OK)).toEqual(TxExecutionResult.SUCCESS);
      expect(MinedTxReceipt.executionResultFromRevertCode(RevertCode.REVERTED)).toEqual(TxExecutionResult.REVERTED);
    });

    it('round-trips a mined receipt', () => {
      const receipt = makeMined(TxStatus.FINALIZED);
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(MinedTxReceipt);
      expect(parsed).toEqual(receipt);
    });

    it('round-trips a mined receipt with a txEffect', async () => {
      const receipt = new MinedTxReceipt(
        TxHash.random(),
        TxStatus.PROVEN,
        TxExecutionResult.SUCCESS,
        7n,
        BlockHash.random(),
        BlockNumber(2),
        0,
        EpochNumber(1),
        undefined,
        await TxEffect.random(),
      );
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(MinedTxReceipt);
      expect(parsed).toEqual(receipt);
      expect((parsed as MinedTxReceipt).txEffect).toBeInstanceOf(TxEffect);
    });

    it('round-trips a mined receipt preserving txIndexInBlock', () => {
      const receipt = new MinedTxReceipt(
        TxHash.random(),
        TxStatus.CHECKPOINTED,
        TxExecutionResult.SUCCESS,
        3n,
        BlockHash.random(),
        BlockNumber(5),
        4,
        EpochNumber(2),
      );
      const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(receipt)));
      expect(parsed).toBeInstanceOf(MinedTxReceipt);
      expect((parsed as MinedTxReceipt).txIndexInBlock).toEqual(4);
      expect(parsed).toEqual(receipt);
    });
  });

  describe('union routing', () => {
    it('routes each status to the correct variant class', () => {
      const pending = TxReceiptSchema.parse(JSON.parse(jsonStringify(new PendingTxReceipt(TxHash.random()))));
      expect(pending).toBeInstanceOf(PendingTxReceipt);

      const dropped = TxReceiptSchema.parse(JSON.parse(jsonStringify(new DroppedTxReceipt(TxHash.random()))));
      expect(dropped).toBeInstanceOf(DroppedTxReceipt);

      for (const status of [TxStatus.PROPOSED, TxStatus.CHECKPOINTED, TxStatus.PROVEN, TxStatus.FINALIZED] as const) {
        const mined = new MinedTxReceipt(
          TxHash.random(),
          status,
          TxExecutionResult.SUCCESS,
          1n,
          BlockHash.random(),
          BlockNumber(1),
          0,
        );
        const parsed = TxReceiptSchema.parse(JSON.parse(jsonStringify(mined)));
        expect(parsed).toBeInstanceOf(MinedTxReceipt);
        expect(parsed.status).toEqual(status);
      }
    });
  });

  describe('mined-only fields are ignored on other variants', () => {
    it('pending and dropped receipts do not surface mined-only fields after round-trip', () => {
      const pending = TxReceiptSchema.parse(JSON.parse(jsonStringify(new PendingTxReceipt(TxHash.random()))));
      expect(pending.blockNumber).toBeUndefined();
      expect(pending.transactionFee).toBeUndefined();
      expect(pending.txEffect).toBeUndefined();

      const dropped = TxReceiptSchema.parse(JSON.parse(jsonStringify(new DroppedTxReceipt(TxHash.random(), 'err'))));
      expect(dropped.blockNumber).toBeUndefined();
      expect(dropped.transactionFee).toBeUndefined();
      expect(dropped.txEffect).toBeUndefined();
    });
  });
});
