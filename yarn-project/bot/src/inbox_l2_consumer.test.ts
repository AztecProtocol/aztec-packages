import { TX_ERROR_EXISTING_NULLIFIER, TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE } from '@aztec/stdlib/tx';

import {
  isAlreadyNullifiedError,
  isFeePaymentError,
  isMessageNotYetConsumableError,
  isRpcError,
} from './inbox_l2_consumer.js';

describe('inbox consumption error predicates', () => {
  const publicMissing = new Error('Assertion failed: Tried to consume nonexistent L1-to-L2 message');
  const privateMissing = new Error('No L1 to L2 message found for message hash 0xabc');
  const publicNullified = new Error('Assertion failed: L1-to-L2 message is already nullified');
  const privateNullified = new Error('No non-nullified L1 to L2 message found for message hash 0xabc');

  describe('isMessageNotYetConsumableError', () => {
    it('recognises both domains reporting a message the anchor does not carry yet', () => {
      expect(isMessageNotYetConsumableError(publicMissing)).toBe(true);
      expect(isMessageNotYetConsumableError(privateMissing)).toBe(true);
    });

    it('sees through a wrapped simulation failure', () => {
      expect(isMessageNotYetConsumableError(new Error('Simulation failed', { cause: publicMissing }))).toBe(true);
    });

    it('does not excuse an already nullified message as one that has yet to arrive', () => {
      expect(isMessageNotYetConsumableError(publicNullified)).toBe(false);
      expect(isMessageNotYetConsumableError(privateNullified)).toBe(false);
    });

    it('does not excuse an arbitrary failure', () => {
      expect(isMessageNotYetConsumableError(new Error('Message not in state'))).toBe(false);
      expect(isMessageNotYetConsumableError(new Error('Assertion failed: Invalid secret'))).toBe(false);
      expect(isMessageNotYetConsumableError(new Error('socket hang up'))).toBe(false);
      expect(isMessageNotYetConsumableError(undefined)).toBe(false);
    });
  });

  describe('isAlreadyNullifiedError', () => {
    it('recognises the duplicate-nullifier rejection from every domain that can produce it', () => {
      expect(isAlreadyNullifiedError(publicNullified)).toBe(true);
      expect(isAlreadyNullifiedError(privateNullified)).toBe(true);
      expect(isAlreadyNullifiedError(new Error(`Tx dropped: ${TX_ERROR_EXISTING_NULLIFIER}`))).toBe(true);
    });

    it('does not accept a wrong secret or a missing message as replay protection', () => {
      expect(isAlreadyNullifiedError(new Error('Assertion failed: Invalid secret hash'))).toBe(false);
      expect(isAlreadyNullifiedError(publicMissing)).toBe(false);
      expect(isAlreadyNullifiedError(privateMissing)).toBe(false);
      expect(isAlreadyNullifiedError(new Error('Simulation failed'))).toBe(false);
    });
  });

  describe('isRpcError and isFeePaymentError', () => {
    it('separates infrastructure failures from consumption failures', () => {
      expect(isRpcError(new Error('connect ECONNREFUSED 127.0.0.1:8080'))).toBe(true);
      expect(isRpcError(new Error('fetch failed'))).toBe(true);
      expect(isRpcError(publicMissing)).toBe(false);
    });

    it('recognises a transaction that could not pay for itself', () => {
      expect(isFeePaymentError(new Error(TX_ERROR_INSUFFICIENT_FEE_PAYER_BALANCE))).toBe(true);
      expect(isFeePaymentError(publicMissing)).toBe(false);
    });
  });
});
