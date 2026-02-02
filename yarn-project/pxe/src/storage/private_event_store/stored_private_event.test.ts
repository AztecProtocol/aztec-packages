import { Fr } from '@aztec/foundation/curves/bn254';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

import { StoredPrivateEvent } from './stored_private_event.js';

describe('StoredPrivateEvent', () => {
  const makeEvent = async (
    overrides: {
      randomness?: Fr;
      msgContent?: Fr[];
      l2BlockNumber?: number;
      l2BlockHash?: BlockHash;
      txHash?: TxHash;
      txIndexInBlock?: number;
      eventIndexInTx?: number;
      contractAddress?: AztecAddress;
      eventSelector?: EventSelector;
      scopes?: Set<string>;
    } = {},
  ) => {
    return new StoredPrivateEvent(
      overrides.randomness ?? Fr.random(),
      overrides.msgContent ?? [Fr.random(), Fr.random(), Fr.random()],
      overrides.l2BlockNumber ?? 42,
      overrides.l2BlockHash ?? BlockHash.random(),
      overrides.txHash ?? TxHash.random(),
      overrides.txIndexInBlock ?? 3,
      overrides.eventIndexInTx ?? 1,
      overrides.contractAddress ?? (await AztecAddress.random()),
      overrides.eventSelector ?? EventSelector.random(),
      overrides.scopes ?? new Set(['scope1', 'scope2']),
    );
  };

  describe('toBuffer/fromBuffer', () => {
    it('round-trips all fields correctly', async () => {
      const event = await makeEvent();
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.randomness).toEqual(event.randomness);
      expect(restored.msgContent).toEqual(event.msgContent);
      expect(restored.l2BlockNumber).toBe(event.l2BlockNumber);
      expect(restored.l2BlockHash).toEqual(event.l2BlockHash);
      expect(restored.txHash).toEqual(event.txHash);
      expect(restored.txIndexInBlock).toBe(event.txIndexInBlock);
      expect(restored.eventIndexInTx).toBe(event.eventIndexInTx);
      expect(restored.contractAddress).toEqual(event.contractAddress);
      expect(restored.eventSelector).toEqual(event.eventSelector);
      expect(restored.scopes).toEqual(event.scopes);
    });

    it('handles empty msgContent', async () => {
      const event = await makeEvent({ msgContent: [] });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.msgContent).toEqual([]);
    });

    it('handles single msgContent field', async () => {
      const content = [Fr.random()];
      const event = await makeEvent({ msgContent: content });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.msgContent).toEqual(content);
    });

    it('handles many msgContent fields', async () => {
      const content = Array.from({ length: 20 }, () => Fr.random());
      const event = await makeEvent({ msgContent: content });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.msgContent).toEqual(content);
    });

    it('handles empty scopes', async () => {
      const event = await makeEvent({ scopes: new Set<string>() });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.scopes.size).toBe(0);
    });

    it('handles single scope', async () => {
      const event = await makeEvent({ scopes: new Set(['only-scope']) });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.scopes).toEqual(new Set(['only-scope']));
    });

    it('handles many scopes', async () => {
      const scopes = new Set(Array.from({ length: 10 }, (_, i) => `scope-${i}`));
      const event = await makeEvent({ scopes });
      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());

      expect(restored.scopes).toEqual(scopes);
    });
  });

  describe('addScope', () => {
    it('adds a new scope', async () => {
      const event = await makeEvent({ scopes: new Set(['existing']) });
      event.addScope('new-scope');

      expect(event.scopes).toEqual(new Set(['existing', 'new-scope']));
    });

    it('does not duplicate an existing scope', async () => {
      const event = await makeEvent({ scopes: new Set(['existing']) });
      event.addScope('existing');

      expect(event.scopes.size).toBe(1);
    });

    it('persists added scopes through serialization', async () => {
      const event = await makeEvent({ scopes: new Set(['initial']) });
      event.addScope('added');

      const restored = StoredPrivateEvent.fromBuffer(event.toBuffer());
      expect(restored.scopes).toEqual(new Set(['initial', 'added']));
    });
  });
});
