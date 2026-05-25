import { SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type Offense, OffenseType } from '@aztec/stdlib/slashing';

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

import { DefaultSlasherConfig } from './config.js';
import { SlashOffensesCollector, type SlashOffensesCollectorSettings } from './slash_offenses_collector.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import {
  WANT_TO_CLEAR_SLASH_EVENT,
  WANT_TO_SLASH_EVENT,
  type WantToClearSlashArgs,
  type WantToSlashArgs,
  type Watcher,
} from './watcher.js';

describe('SlashOffensesCollector', () => {
  let offensesCollector: SlashOffensesCollector;
  let kvStore: ReturnType<typeof openTmpStore>;
  let offensesStore: SlasherOffensesStore;
  let logger: Logger;

  const settings: SlashOffensesCollectorSettings = {
    epochDuration: 32,
    slashingAmounts: [100n, 200n, 300n],
    rollupRegisteredAtL2Slot: 100 as SlotNumber,
  };

  const config: SlasherConfig = {
    ...DefaultSlasherConfig,
    slashGracePeriodL2Slots: 10,
    slashMaxPayloadSize: 100,
  };

  beforeEach(() => {
    kvStore = openTmpStore(true);
    offensesStore = new SlasherOffensesStore(kvStore, {
      slashingRoundSize: 32 * 6,
      epochDuration: 32,
      slashOffenseExpirationRounds: 4,
    });
    logger = createLogger('test');

    offensesCollector = new SlashOffensesCollector(config, settings, [], offensesStore, logger);
  });

  afterEach(async () => {
    await kvStore.close();
  });

  it('should handle want-to-slash events', async () => {
    const wantToSlashArgs: WantToSlashArgs[] = [
      {
        validator: EthAddress.random(),
        amount: 1000000000000000000n, // 1 ETH
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      },
    ];

    await offensesCollector.handleWantToSlash(wantToSlashArgs);

    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator: wantToSlashArgs[0].validator,
      amount: wantToSlashArgs[0].amount,
      offenseType: wantToSlashArgs[0].offenseType,
      epochOrSlot: wantToSlashArgs[0].epochOrSlot,
    });
  });

  it('should skip duplicate offenses', async () => {
    const validator = EthAddress.random();
    const wantToSlashArgs: WantToSlashArgs[] = [
      {
        validator,
        amount: 1000000000000000000n, // 1 ETH
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      },
    ];

    // Handle the same offense twice
    await offensesCollector.handleWantToSlash(wantToSlashArgs);
    await offensesCollector.handleWantToSlash(wantToSlashArgs);

    // Check that only one offense was stored (duplicate was skipped)
    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator,
      amount: wantToSlashArgs[0].amount,
      offenseType: wantToSlashArgs[0].offenseType,
      epochOrSlot: wantToSlashArgs[0].epochOrSlot,
    });
  });

  it('should skip offenses that happen during grace period after upgrade', async () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();

    // Grace period is registeredSlot (100) + gracePeriodL2Slots (10) = 110
    // Create offense during grace period (slot 105 < 110)
    const gracePeriodOffense: WantToSlashArgs[] = [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 105n, // Within grace period (< 110)
      },
    ];

    // Create offense after grace period (slot 115 >= 110)
    const validOffense: WantToSlashArgs[] = [
      {
        validator: validator2,
        amount: 2000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 115n, // After grace period (>= 110)
      },
    ];

    // Handle both offenses
    await offensesCollector.handleWantToSlash(gracePeriodOffense);
    await offensesCollector.handleWantToSlash(validOffense);

    // Check that only the valid offense (after grace period) was stored
    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator: validator2,
      amount: validOffense[0].amount,
      offenseType: validOffense[0].offenseType,
      epochOrSlot: validOffense[0].epochOrSlot,
    });
  });

  it('should handle multiple offenses in a single call', async () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();
    const validator3 = EthAddress.random();

    // Grace period ends at registeredSlot (100) + gracePeriod (10) = 110
    // All offenses are after the grace period
    const multipleOffensesArgs: WantToSlashArgs[] = [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n, // epoch 100 → slot 3200, well past grace period
      },
      {
        validator: validator2,
        amount: 2000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 150n, // slot 150 >= 110
      },
      {
        validator: validator3,
        amount: 1500000000000000000n,
        offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
        epochOrSlot: 175n, // slot 175 >= 110
      },
    ];

    await offensesCollector.handleWantToSlash(multipleOffensesArgs);

    // Check that all three offenses were stored
    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(3);

    // Verify each offense was stored correctly
    const offensesByValidator = pendingOffenses.reduce(
      (acc, offense) => {
        acc[offense.validator.toString()] = offense;
        return acc;
      },
      {} as Record<string, Offense>,
    );

    expect(offensesByValidator[validator1.toString()]).toMatchObject({
      validator: validator1,
      amount: 1000000000000000000n,
      offenseType: OffenseType.INACTIVITY,
      epochOrSlot: 100n,
    });

    expect(offensesByValidator[validator2.toString()]).toMatchObject({
      validator: validator2,
      amount: 2000000000000000000n,
      offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
      epochOrSlot: 150n,
    });

    expect(offensesByValidator[validator3.toString()]).toMatchObject({
      validator: validator3,
      amount: 1500000000000000000n,
      offenseType: OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS,
      epochOrSlot: 175n,
    });
  });

  it('should handle want-to-clear-slash events', async () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();
    const offenses: WantToSlashArgs[] = [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      },
      {
        validator: validator2,
        amount: 1000000000000000000n,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      },
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: 150n,
      },
    ];
    const clearArgs: WantToClearSlashArgs[] = [
      {
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      },
    ];

    await offensesCollector.handleWantToSlash(offenses);
    await offensesCollector.handleWantToClearSlash(clearArgs);

    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator: validator1,
      offenseType: OffenseType.DUPLICATE_PROPOSAL,
      epochOrSlot: 150n,
    });
  });

  it('should process queued slash and clear events in emission order', async () => {
    const watcher = new EventEmitter() as unknown as Watcher;
    watcher.updateConfig = jest.fn();
    offensesCollector = new SlashOffensesCollector(config, settings, [watcher], offensesStore, logger);
    await offensesCollector.start();

    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();

    watcher.emit(WANT_TO_SLASH_EVENT, [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      },
      {
        validator: validator2,
        amount: 1000000000000000000n,
        offenseType: OffenseType.DUPLICATE_PROPOSAL,
        epochOrSlot: 150n,
      },
    ] satisfies WantToSlashArgs[]);
    watcher.emit(WANT_TO_CLEAR_SLASH_EVENT, [
      {
        offenseType: OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL,
        epochOrSlot: 150n,
      },
    ] satisfies WantToClearSlashArgs[]);

    await offensesCollector.stop();

    const pendingOffenses = await offensesStore.getOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator: validator2,
      offenseType: OffenseType.DUPLICATE_PROPOSAL,
      epochOrSlot: 150n,
    });
  });
});
