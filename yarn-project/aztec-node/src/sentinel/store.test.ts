import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { AztecLMDBStoreV2, openTmpStore } from '@aztec/kv-store/lmdb-v2';
import type { ValidatorStatusInSlot } from '@aztec/stdlib/validators';

import { SentinelStore } from './store.js';

describe('sentinel-store', () => {
  let kvStore: AztecLMDBStoreV2;
  let store: SentinelStore;
  let log: Logger;

  const historyLength = 4;
  const historicProvenPerformanceLength = 3;

  beforeEach(async () => {
    log = createLogger('sentinel:store:test');
    kvStore = await openTmpStore('sentinel-store-test');
    store = new SentinelStore(kvStore, { historyLength, historicProvenPerformanceLength });
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('inserts new validators with all statuses', async () => {
    const slot = SlotNumber(1);
    const validators: `0x${string}`[] = times(6, () => EthAddress.random().toString());
    const statuses: ValidatorStatusInSlot[] = [
      'checkpoint-mined',
      'checkpoint-proposed',
      'checkpoint-missed',
      'blocks-missed',
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
    await store.updateValidators(
      SlotNumber(1),
      Object.fromEntries(existingValidators.map(v => [v, 'checkpoint-mined'] as const)),
    );

    // Insert new validators with their statuses, and append history to existing ones
    await store.updateValidators(
      SlotNumber(2),
      Object.fromEntries([
        ...newValidators.map(v => [v, 'checkpoint-proposed'] as const),
        ...existingValidators.map(v => [v, 'checkpoint-missed'] as const),
      ]),
    );

    const histories = await store.getHistories();
    expect(Object.keys(histories)).toHaveLength(4);

    expect(histories[existingValidators[0]]).toEqual([
      { slot: SlotNumber(1), status: 'checkpoint-mined' },
      { slot: SlotNumber(2), status: 'checkpoint-missed' },
    ]);

    expect(histories[existingValidators[1]]).toEqual([
      { slot: SlotNumber(1), status: 'checkpoint-mined' },
      { slot: SlotNumber(2), status: 'checkpoint-missed' },
    ]);

    expect(histories[newValidators[0]]).toEqual([{ slot: SlotNumber(2), status: 'checkpoint-proposed' }]);
    expect(histories[newValidators[1]]).toEqual([{ slot: SlotNumber(2), status: 'checkpoint-proposed' }]);
  });

  it('trims history to the specified length', async () => {
    const slot = 1;
    const validator = EthAddress.random().toString();

    for (let i = 0; i < 10; i++) {
      await store.updateValidators(SlotNumber(slot + i), { [validator]: 'checkpoint-mined' });
    }

    const histories = await store.getHistories();
    expect(histories[validator]).toHaveLength(historyLength);
    expect(histories[validator]).toEqual([
      { slot: SlotNumber(7), status: 'checkpoint-mined' },
      { slot: SlotNumber(8), status: 'checkpoint-mined' },
      { slot: SlotNumber(9), status: 'checkpoint-mined' },
      { slot: SlotNumber(10), status: 'checkpoint-mined' },
    ]);
  });

  it('updates proven performance', async () => {
    const validator = EthAddress.random();
    await store.updateProvenPerformance(EpochNumber(1), { [validator.toString()]: { missed: 2, total: 10 } });
    const provenPerformance = await store.getProvenPerformance(validator);
    expect(provenPerformance).toEqual([{ epoch: EpochNumber(1), missed: 2, total: 10 }]);

    await store.updateProvenPerformance(EpochNumber(1), { [validator.toString()]: { missed: 3, total: 10 } });
    const provenPerformance2 = await store.getProvenPerformance(validator);
    expect(provenPerformance2).toEqual([{ epoch: EpochNumber(1), missed: 3, total: 10 }]);

    await store.updateProvenPerformance(EpochNumber(2), { [validator.toString()]: { missed: 4, total: 10 } });
    const provenPerformance3 = await store.getProvenPerformance(validator);
    expect(provenPerformance3).toEqual([
      { epoch: EpochNumber(1), missed: 3, total: 10 },
      { epoch: EpochNumber(2), missed: 4, total: 10 },
    ]);
  });

  it('trims proven performance to the specified historicProvenPerformanceLength', async () => {
    const validator = EthAddress.random();

    // Add 5 epochs worth of proven performance data (more than historicProvenPerformanceLength = 3)
    for (let i = 1; i <= 5; i++) {
      await store.updateProvenPerformance(EpochNumber(i), { [validator.toString()]: { missed: i, total: 10 } });
    }

    const provenPerformance = await store.getProvenPerformance(validator);

    // Should only keep the most recent 3 entries (epochs 3, 4, 5)
    expect(provenPerformance).toHaveLength(historicProvenPerformanceLength);
    expect(provenPerformance).toEqual([
      { epoch: EpochNumber(3), missed: 3, total: 10 },
      { epoch: EpochNumber(4), missed: 4, total: 10 },
      { epoch: EpochNumber(5), missed: 5, total: 10 },
    ]);
  });

  it('getHistoricProvenPerformanceLength returns the correct value', () => {
    expect(store.getHistoricProvenPerformanceLength()).toBe(historicProvenPerformanceLength);
  });

  it('proven performance with 2k entries', async () => {
    const validator = EthAddress.random();
    const totalEntries = 2000;

    log.info(`Starting stress test with ${totalEntries} proven performance entries`);

    // Track timing for additions
    const addTimes: number[] = [];
    const startTime = Date.now();

    // Add 2k entries
    for (let i = 1; i <= totalEntries; i++) {
      const addStart = Date.now();
      await store.updateProvenPerformance(EpochNumber(i), {
        [validator.toString()]: { missed: i % 10, total: 10 },
      });
      const addEnd = Date.now();
      addTimes.push(addEnd - addStart);

      // Log progress every 500 entries
      if (i % 500 === 0) {
        const avgAddTime = addTimes.slice(-500).reduce((a, b) => a + b, 0) / 500;
        log.info(`Added ${i}/${totalEntries} entries, avg time per entry: ${avgAddTime.toFixed(2)}ms`);
      }
    }

    const totalAddTime = Date.now() - startTime;
    const avgAddTime = addTimes.reduce((a, b) => a + b, 0) / addTimes.length;

    log.info(`Added ${totalEntries} entries in ${totalAddTime}ms with avg ${avgAddTime.toFixed(2)}ms per entry`);

    // Track timing for retrievals
    const retrievalTimes: number[] = [];
    const numRetrievals = 10;

    log.info(`Starting ${numRetrievals} retrieval tests`);

    for (let i = 0; i < numRetrievals; i++) {
      const retrievalStart = Date.now();
      const performance = await store.getProvenPerformance(validator);
      const retrievalEnd = Date.now();
      retrievalTimes.push(retrievalEnd - retrievalStart);

      // Verify we only keep the configured number of entries
      expect(performance).toHaveLength(historicProvenPerformanceLength);

      // Verify we kept the most recent entries
      const expectedStartEpoch = totalEntries - historicProvenPerformanceLength + 1;
      expect(performance[0].epoch).toBe(EpochNumber(expectedStartEpoch));
      expect(performance[performance.length - 1].epoch).toBe(EpochNumber(totalEntries));
    }

    const avgRetrievalTime = retrievalTimes.reduce((a, b) => a + b, 0) / retrievalTimes.length;
    log.info(`Completed ${numRetrievals} retrievals with avg time of ${avgRetrievalTime.toFixed(2)}ms per retrieval`);
  });

  it('does not allow insertion of invalid validator addresses', async () => {
    const validator = '0x123';
    await expect(
      store.updateProvenPerformance(EpochNumber(1), { [validator]: { missed: 2, total: 10 } }),
    ).rejects.toThrow();
    await expect(store.updateValidators(SlotNumber(1), { [validator]: 'checkpoint-mined' })).rejects.toThrow();
  });
});
