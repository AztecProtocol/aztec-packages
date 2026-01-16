import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import { type Offense, OffenseType } from '@aztec/stdlib/slashing';

import { DefaultSlasherConfig } from './config.js';
import { SlashOffensesCollector, type SlashOffensesCollectorSettings } from './slash_offenses_collector.js';
import { SlasherOffensesStore } from './stores/offenses_store.js';
import type { WantToSlashArgs } from './watcher.js';

describe('SlashOffensesCollector', () => {
  let offensesCollector: SlashOffensesCollector;
  let kvStore: ReturnType<typeof openTmpStore>;
  let offensesStore: SlasherOffensesStore;
  let logger: Logger;

  const settings: SlashOffensesCollectorSettings = {
    epochDuration: 32,
    slashingAmounts: [100n, 200n, 300n],
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

    const pendingOffenses = await offensesStore.getPendingOffenses();
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
    const pendingOffenses = await offensesStore.getPendingOffenses();
    expect(pendingOffenses).toHaveLength(1);
    expect(pendingOffenses[0]).toMatchObject({
      validator,
      amount: wantToSlashArgs[0].amount,
      offenseType: wantToSlashArgs[0].offenseType,
      epochOrSlot: wantToSlashArgs[0].epochOrSlot,
    });
  });

  it('should skip offenses that happen during grace period', async () => {
    const validator1 = EthAddress.random();
    const validator2 = EthAddress.random();

    // Create offense during grace period (slot < slashGracePeriodL2Slots = 10)
    const gracePeriodOffense: WantToSlashArgs[] = [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 5n, // Within grace period (< 10)
      },
    ];

    // Create offense after grace period
    const validOffense: WantToSlashArgs[] = [
      {
        validator: validator2,
        amount: 2000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS, // Slot-based offense
        epochOrSlot: 20n, // After grace period (>= 10)
      },
    ];

    // Handle both offenses
    await offensesCollector.handleWantToSlash(gracePeriodOffense);
    await offensesCollector.handleWantToSlash(validOffense);

    // Check that only the valid offense (after grace period) was stored
    const pendingOffenses = await offensesStore.getPendingOffenses();
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

    // Create an event with multiple offenses in a single array
    const multipleOffensesArgs: WantToSlashArgs[] = [
      {
        validator: validator1,
        amount: 1000000000000000000n,
        offenseType: OffenseType.INACTIVITY,
        epochOrSlot: 100n,
      },
      {
        validator: validator2,
        amount: 2000000000000000000n,
        offenseType: OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS,
        epochOrSlot: 50n,
      },
      {
        validator: validator3,
        amount: 1500000000000000000n,
        offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
        epochOrSlot: 75n,
      },
    ];

    await offensesCollector.handleWantToSlash(multipleOffensesArgs);

    // Check that all three offenses were stored
    const pendingOffenses = await offensesStore.getPendingOffenses();
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
      epochOrSlot: 50n,
    });

    expect(offensesByValidator[validator3.toString()]).toMatchObject({
      validator: validator3,
      amount: 1500000000000000000n,
      offenseType: OffenseType.ATTESTED_DESCENDANT_OF_INVALID,
      epochOrSlot: 75n,
    });
  });
});
