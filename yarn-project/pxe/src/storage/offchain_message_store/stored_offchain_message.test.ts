import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';
import type { OffchainMessage } from '@aztec/stdlib/tx';

import { StoredOffchainMessage } from './stored_offchain_message.js';

describe('StoredOffchainMessage', () => {
  const makeMessage = async (): Promise<OffchainMessage> => ({
    offchainEffect: {
      data: [Fr.random(), Fr.random(), Fr.random()],
      contractAddress: await AztecAddress.random(),
    },
    txHash: TxHash.random(),
  });

  describe('construction', () => {
    it('creates with default pending status', async () => {
      const msg = await makeMessage();
      const ingestedAt = Date.now();
      const stored = new StoredOffchainMessage(msg, ingestedAt);

      expect(stored.offchainMessage).toBe(msg);
      expect(stored.status).toBe('pending');
      expect(stored.ingestedAt).toBe(ingestedAt);
    });

    it('creates with explicit status', async () => {
      const msg = await makeMessage();
      const stored = new StoredOffchainMessage(msg, Date.now(), 'processed');

      expect(stored.status).toBe('processed');
    });
  });

  describe('fromMessage', () => {
    it('stamps ingestedAt from Date.now()', async () => {
      const msg = await makeMessage();
      const before = Date.now();
      const stored = StoredOffchainMessage.fromMessage(msg);
      const after = Date.now();

      expect(stored.offchainMessage).toBe(msg);
      expect(stored.status).toBe('pending');
      expect(stored.ingestedAt).toBeGreaterThanOrEqual(before);
      expect(stored.ingestedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('serialization', () => {
    it('roundtrips a pending message', async () => {
      const msg = await makeMessage();
      const original = StoredOffchainMessage.fromMessage(msg);

      const restored = StoredOffchainMessage.fromBuffer(original.toBuffer());

      expect(restored.status).toBe('pending');
      expect(restored.ingestedAt).toBe(original.ingestedAt);
      expect(restored.offchainMessage.txHash.equals(msg.txHash)).toBe(true);
      expect(restored.offchainMessage.offchainEffect.contractAddress.equals(msg.offchainEffect.contractAddress)).toBe(
        true,
      );
      expect(restored.offchainMessage.offchainEffect.data.length).toBe(msg.offchainEffect.data.length);
      for (let i = 0; i < msg.offchainEffect.data.length; i++) {
        expect(restored.offchainMessage.offchainEffect.data[i].equals(msg.offchainEffect.data[i])).toBe(true);
      }
    });

    it('roundtrips each status', async () => {
      const msg = await makeMessage();
      for (const status of ['pending', 'processed', 'invalid', 'expired'] as const) {
        const original = new StoredOffchainMessage(msg, Date.now(), status);
        const restored = StoredOffchainMessage.fromBuffer(original.toBuffer());
        expect(restored.status).toBe(status);
      }
    });

    it('preserves large ingestedAt timestamps', async () => {
      const msg = await makeMessage();
      const largeTimestamp = 1739836800000; // 2025-02-18 in ms
      const original = new StoredOffchainMessage(msg, largeTimestamp);

      const restored = StoredOffchainMessage.fromBuffer(original.toBuffer());

      expect(restored.ingestedAt).toBe(largeTimestamp);
    });

    it('roundtrips a message with varying data lengths', async () => {
      const contractAddress = await AztecAddress.random();

      for (const dataLen of [0, 1, 5, 20]) {
        const msg: OffchainMessage = {
          offchainEffect: {
            data: Array.from({ length: dataLen }, () => Fr.random()),
            contractAddress,
          },
          txHash: TxHash.random(),
        };
        const original = StoredOffchainMessage.fromMessage(msg);
        const restored = StoredOffchainMessage.fromBuffer(original.toBuffer());

        expect(restored.offchainMessage.offchainEffect.data.length).toBe(dataLen);
      }
    });
  });

  describe('status', () => {
    it('can be updated via setter', async () => {
      const stored = StoredOffchainMessage.fromMessage(await makeMessage());
      expect(stored.status).toBe('pending');

      stored.status = 'processed';
      expect(stored.status).toBe('processed');
    });

    it('persists status change through serialization', async () => {
      const stored = StoredOffchainMessage.fromMessage(await makeMessage());
      stored.status = 'invalid';

      const restored = StoredOffchainMessage.fromBuffer(stored.toBuffer());
      expect(restored.status).toBe('invalid');
    });

    it('preserves offchainMessage through status changes', async () => {
      const msg = await makeMessage();
      const stored = StoredOffchainMessage.fromMessage(msg);

      stored.status = 'expired';

      expect(stored.offchainMessage).toBe(msg);
      expect(stored.offchainMessage.txHash.equals(msg.txHash)).toBe(true);
    });
  });
});
