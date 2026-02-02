import { BlockNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { BlockHash } from '../block/block_hash.js';
import { TxHash } from './tx_hash.js';
import { TxExecutionResult, TxReceipt, TxStatus } from './tx_receipt.js';

describe('TxReceipt', () => {
  it('serializes and deserializes from json', () => {
    const receipt = new TxReceipt(
      TxHash.random(),
      TxStatus.PROVEN,
      TxExecutionResult.SUCCESS,
      'error',
      1n,
      BlockHash.random(),
      BlockNumber(1),
    );

    expect(TxReceipt.schema.parse(JSON.parse(jsonStringify(receipt)))).toEqual(receipt);
  });

  it('serializes and deserializes from json with undefined fields', () => {
    const receipt = new TxReceipt(
      TxHash.random(),
      TxStatus.DROPPED,
      undefined,
      'error',
      undefined,
      undefined,
      undefined,
    );

    expect(TxReceipt.schema.parse(JSON.parse(jsonStringify(receipt)))).toEqual(receipt);
  });

  describe('helper methods', () => {
    it('isSuccess returns true for successful execution', () => {
      const receipt = new TxReceipt(TxHash.random(), TxStatus.PROPOSED, TxExecutionResult.SUCCESS, undefined);
      expect(receipt.hasExecutionSucceeded()).toBe(true);
    });

    it('isSuccess returns false for reverted execution', () => {
      const receipt = new TxReceipt(
        TxHash.random(),
        TxStatus.PROPOSED,
        TxExecutionResult.APP_LOGIC_REVERTED,
        undefined,
      );
      expect(receipt.hasExecutionSucceeded()).toBe(false);
    });

    it('isReverted returns true for reverted execution', () => {
      const receipt = new TxReceipt(
        TxHash.random(),
        TxStatus.PROPOSED,
        TxExecutionResult.APP_LOGIC_REVERTED,
        undefined,
      );
      expect(receipt.hasExecutionReverted()).toBe(true);
    });

    it('isReverted returns false for successful execution', () => {
      const receipt = new TxReceipt(TxHash.random(), TxStatus.PROPOSED, TxExecutionResult.SUCCESS, undefined);
      expect(receipt.hasExecutionReverted()).toBe(false);
    });

    it('isMined returns true for proposed, checkpointed, proven, and finalized', () => {
      expect(new TxReceipt(TxHash.random(), TxStatus.PROPOSED, undefined, undefined).isMined()).toBe(true);
      expect(new TxReceipt(TxHash.random(), TxStatus.CHECKPOINTED, undefined, undefined).isMined()).toBe(true);
      expect(new TxReceipt(TxHash.random(), TxStatus.PROVEN, undefined, undefined).isMined()).toBe(true);
      expect(new TxReceipt(TxHash.random(), TxStatus.FINALIZED, undefined, undefined).isMined()).toBe(true);
    });

    it('isMined returns false for pending and dropped', () => {
      expect(new TxReceipt(TxHash.random(), TxStatus.PENDING, undefined, undefined).isMined()).toBe(false);
      expect(new TxReceipt(TxHash.random(), TxStatus.DROPPED, undefined, undefined).isMined()).toBe(false);
    });

    it('isPending returns true for pending status', () => {
      const receipt = new TxReceipt(TxHash.random(), TxStatus.PENDING, undefined, undefined);
      expect(receipt.isPending()).toBe(true);
    });

    it('isDropped returns true for dropped status', () => {
      const receipt = new TxReceipt(TxHash.random(), TxStatus.DROPPED, undefined, undefined);
      expect(receipt.isDropped()).toBe(true);
    });
  });
});
