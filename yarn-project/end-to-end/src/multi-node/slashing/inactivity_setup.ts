import type { AztecNodeService } from '@aztec/aztec-node';
import type { EthAddress } from '@aztec/aztec.js/addresses';
import { EpochNumber } from '@aztec/foundation/branded-types';

import {
  MultiNodeTestContext,
  SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
  buildMockGossipValidators,
} from '../multi_node_test_context.js';

const NUM_NODES = 6;
const NUM_VALIDATORS = NUM_NODES;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const SLASHING_QUORUM = 3;
const EPOCH_DURATION = 2;
const SLASHING_ROUND_SIZE_IN_EPOCHS = 2;
const ETHEREUM_SLOT_DURATION = process.env.CI ? 8 : 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;

// How many epochs it may take to set everything up, so we dont slash during this period
const SETUP_EPOCH_DURATION = 8;

/** Stateful fixture for the inactivity-slash suites: a slasher-enabled committee on the mock-gossip bus. */
export class InactivityTest {
  public test!: MultiNodeTestContext;
  public nodes!: AztecNodeService[];
  public activeNodes!: AztecNodeService[];
  public inactiveNodes!: AztecNodeService[];
  public offlineValidators!: EthAddress[];

  private inactiveNodeCount: number;

  constructor(opts: { inactiveNodeCount: number }) {
    this.inactiveNodeCount = opts.inactiveNodeCount;
  }

  static async setup(opts: {
    slashInactivityConsecutiveEpochThreshold: number;
    inactiveNodeCount: number;
  }): Promise<InactivityTest> {
    const inactivityTest = new InactivityTest(opts);
    await inactivityTest.run(opts);
    return inactivityTest;
  }

  private async run(opts: { slashInactivityConsecutiveEpochThreshold: number; inactiveNodeCount: number }) {
    this.test = await MultiNodeTestContext.setup({
      ...SLASHER_ENABLED_MULTI_VALIDATOR_OPTS,
      anvilSlotsInAnEpoch: 4,
      // A fake prover node is started by the context (realProofs:false); give it the multi-epoch
      // proving delay the inactivity scenario relied on, and keep enough broker history.
      proverNodeConfig: { proverNodeEpochProvingDelayMs: AZTEC_SLOT_DURATION * 1000 },
      proverBrokerMaxEpochsToKeepResultsFor: 20,
      aztecTargetCommitteeSize: COMMITTEE_SIZE,
      aztecSlotDuration: AZTEC_SLOT_DURATION,
      ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
      aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      listenAddress: '127.0.0.1',
      minTxsPerBlock: 0,
      aztecEpochDuration: EPOCH_DURATION,
      sentinelEnabled: true,
      slashingQuorum: SLASHING_QUORUM,
      slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE_IN_EPOCHS,
      slashInactivityTargetPercentage: 0.8,
      slashGracePeriodL2Slots: SETUP_EPOCH_DURATION * EPOCH_DURATION, // do not slash during setup
      slashAmountSmall: SLASHING_UNIT,
      slashAmountMedium: SLASHING_UNIT * 2n,
      slashAmountLarge: SLASHING_UNIT * 3n,
      slashInactivityConsecutiveEpochThreshold: opts.slashInactivityConsecutiveEpochThreshold,
      slashInactivityPenalty: SLASHING_AMOUNT,
      initialValidators: buildMockGossipValidators(NUM_VALIDATORS),
    });

    const { rollup } = await this.test.getSlashingContracts();
    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - SLASHING_AMOUNT).toBeLessThan(biggestEjection);

    // Create all active nodes (running sequencer) plus the inactive ones (sequencer disabled).
    const activeCount = NUM_NODES - this.inactiveNodeCount;
    this.activeNodes = await Promise.all(
      Array.from({ length: activeCount }, (_, i) => this.test.createValidatorNodeAt(i)),
    );
    this.inactiveNodes = await Promise.all(
      Array.from({ length: this.inactiveNodeCount }, (_, i) =>
        this.test.createValidatorNodeAt(activeCount + i, { dontStartSequencer: true }),
      ),
    );

    this.nodes = [...this.activeNodes, ...this.inactiveNodes];

    if (this.nodes.length !== NUM_NODES) {
      throw new Error(`Expected ${NUM_NODES} nodes but got ${this.nodes.length}`);
    }

    this.offlineValidators = this.test.validators
      .slice(this.test.validators.length - this.inactiveNodeCount)
      .map(v => v.attester);

    this.test.logger.warn(`Setup complete. Offline validators are ${this.offlineValidators.join(', ')}.`, {
      validators: this.test.validators,
      offlineValidators: this.offlineValidators,
    });

    this.test.logger.warn(`Advancing to epoch ${SETUP_EPOCH_DURATION - 1} (slashing will start after it is completed)`);
    await this.test.context.cheatCodes.rollup.advanceToEpoch(EpochNumber(SETUP_EPOCH_DURATION - 1));
  }

  public async teardown() {
    await this.test.teardown();
  }

  public get rollup() {
    return this.test.rollup;
  }

  public get logger() {
    return this.test.logger;
  }

  public get config() {
    return this.test.context.config;
  }

  public get monitor() {
    return this.test.monitor;
  }

  public get slashingAmount() {
    return SLASHING_AMOUNT;
  }
}
