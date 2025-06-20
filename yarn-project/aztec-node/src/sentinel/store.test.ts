import { times } from '@aztec/foundation/collection';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ValidatorStatusInSlot } from '@aztec/stdlib/validators';

import { SentinelStore } from './store.js';

describe('sentinel-store', () => {
  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;

  beforeEach(async () => {
    kvStore = await openTmpStore('sentinel-store-test');
    store = new SentinelStore(kvStore, { historyLength: 4 });
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('inserts new validators with all statuses', async () => {
    const slot = 1n;
    const validators: `0x${string}`[] = times(5, i => `0x${i}` as `0x${string}`);
    const statuses: ValidatorStatusInSlot[] = [
      'block-mined',
      'block-proposed',
      'block-missed',
      'attestation-sent',
      'attestation-missed',
    ];

    await store.updateValidators(slot, Object.fromEntries(validators.map((v, i) => [v, statuses[i]] as const)));

    const histories = await store.getHistories();
    expect(Object.keys(histories)).toHaveLength(validators.length);

    // eslint-disable-next-line @typescript-eslint/no-for-in-array
    for (const index in validators) {
      const validator = validators[index];
      const history = histories[validator];
      expect(history).toHaveLength(1);
      expect(history[0].slot).toEqual(slot);
      expect(history[0].status).toEqual(statuses[index]);
    }
  });

  it('updates existing validators with new slots and inserts new ones', async () => {
    const existingValidators: `0x${string}`[] = times(2, i => `0x${i}` as `0x${string}`);
    const newValidators: `0x${string}`[] = times(2, i => `0x${i + 2}` as `0x${string}`);

    // Insert existing validators with initial statuses
    await store.updateValidators(1n, Object.fromEntries(existingValidators.map(v => [v, 'block-mined'] as const)));

    // Insert new validators with their statuses, and append history to existing ones
    await store.updateValidators(
      2n,
      Object.fromEntries([
        ...newValidators.map(v => [v, 'block-proposed'] as const),
        ...existingValidators.map(v => [v, 'block-missed'] as const),
      ]),
    );

    const histories = await store.getHistories();
    expect(Object.keys(histories)).toHaveLength(4);

    expect(histories[existingValidators[0]]).toEqual([
      { slot: 1n, status: 'block-mined' },
      { slot: 2n, status: 'block-missed' },
    ]);

    expect(histories[existingValidators[1]]).toEqual([
      { slot: 1n, status: 'block-mined' },
      { slot: 2n, status: 'block-missed' },
    ]);

    expect(histories[newValidators[0]]).toEqual([{ slot: 2n, status: 'block-proposed' }]);
    expect(histories[newValidators[1]]).toEqual([{ slot: 2n, status: 'block-proposed' }]);
  });

  it('trims history to the specified length', async () => {
    const slot = 1n;
    const validator: `0x${string}` = '0x1' as `0x${string}`;

    for (let i = 0; i < 10; i++) {
      await store.updateValidators(slot + BigInt(i), { [validator]: 'block-mined' });
    }

    const histories = await store.getHistories();
    expect(histories[validator]).toHaveLength(4);
    expect(histories[validator]).toEqual([
      { slot: 7n, status: 'block-mined' },
      { slot: 8n, status: 'block-mined' },
      { slot: 9n, status: 'block-mined' },
      { slot: 10n, status: 'block-mined' },
    ]);
  });
});
