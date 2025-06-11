import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ValidatorStatusInSlot } from '@aztec/stdlib/validators';

import { SentinelStore } from './store.js';

describe('sentinel-store', () => {
  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;
  const historyLength = 4;

  beforeEach(async () => {
    kvStore = await openTmpStore('sentinel-store-test');
    store = new SentinelStore(kvStore, { historyLength });
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('inserts new validators with all statuses', async () => {
    const slot = 1n;
    const validators: `0x${string}`[] = times(5, () => EthAddress.random().toString());
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
    const existingValidators: `0x${string}`[] = times(2, () => EthAddress.random().toString());
    const newValidators: `0x${string}`[] = times(2, () => EthAddress.random().toString());

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
    const validator = EthAddress.random().toString();

    for (let i = 0; i < 10; i++) {
      await store.updateValidators(slot + BigInt(i), { [validator]: 'block-mined' });
    }

    const histories = await store.getHistories();
    expect(histories[validator]).toHaveLength(historyLength);
    expect(histories[validator]).toEqual([
      { slot: 7n, status: 'block-mined' },
      { slot: 8n, status: 'block-mined' },
      { slot: 9n, status: 'block-mined' },
      { slot: 10n, status: 'block-mined' },
    ]);
  });

  it('updates proven performance', async () => {
    const validator = EthAddress.random();
    await store.updateProvenPerformance(1n, { [validator.toString()]: { missed: 2, total: 10 } });
    const provenPerformance = await store.getProvenPerformance(validator);
    expect(provenPerformance).toEqual([{ epoch: 1n, missed: 2, total: 10 }]);

    await store.updateProvenPerformance(1n, { [validator.toString()]: { missed: 3, total: 10 } });
    const provenPerformance2 = await store.getProvenPerformance(validator);
    expect(provenPerformance2).toEqual([{ epoch: 1n, missed: 3, total: 10 }]);

    await store.updateProvenPerformance(2n, { [validator.toString()]: { missed: 4, total: 10 } });
    const provenPerformance3 = await store.getProvenPerformance(validator);
    expect(provenPerformance3).toEqual([
      { epoch: 1n, missed: 3, total: 10 },
      { epoch: 2n, missed: 4, total: 10 },
    ]);
  });

  it('does not allow insertion of invalid validator addresses', async () => {
    const validator = '0x123';
    await expect(store.updateProvenPerformance(1n, { [validator]: { missed: 2, total: 10 } })).rejects.toThrow();
    await expect(store.updateValidators(1n, { [validator]: 'block-mined' })).rejects.toThrow();
  });
});
