import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';

import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const NUM_NODES = 6;
const NUM_VALIDATORS = NUM_NODES;
const COMMITTEE_SIZE = NUM_VALIDATORS;
const SLASHING_QUORUM = 3;
const EPOCH_DURATION = 2;
const SLASHING_ROUND_SIZE_IN_EPOCHS = 2;
const BOOT_NODE_UDP_PORT = 4500;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;

// How many epochs it may take to set everything up, so we dont slash during this period
const SETUP_EPOCH_DURATION = 5;

export class P2PInactivityTest {
  public nodes!: AztecNodeService[];
  public activeNodes!: AztecNodeService[];
  public inactiveNodes!: AztecNodeService[];

  public rollup!: RollupContract;
  public offlineValidators!: EthAddress[];

  private dataDir: string;
  private inactiveNodeCount: number;
  private keepInitialNode: boolean;

  constructor(
    public readonly test: P2PNetworkTest,
    opts: { inactiveNodeCount: number; keepInitialNode?: boolean },
  ) {
    this.dataDir = fs.mkdtempSync(path.join(os.tmpdir(), test.testName));
    this.inactiveNodeCount = opts.inactiveNodeCount;
    this.keepInitialNode = opts.keepInitialNode ?? false;
  }

  static async create(
    testName: string,
    opts: { slashInactivityConsecutiveEpochThreshold: number; inactiveNodeCount: number; keepInitialNode?: boolean },
  ) {
    const test = await P2PNetworkTest.create({
      testName,
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      startProverNode: true,
      initialConfig: {
        proverNodeConfig: { proverNodeEpochProvingDelayMs: AZTEC_SLOT_DURATION * 1000 },
        aztecTargetCommitteeSize: COMMITTEE_SIZE,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: EPOCH_DURATION,
        validatorReexecute: false,
        sentinelEnabled: true,
        slashingQuorum: SLASHING_QUORUM,
        slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE_IN_EPOCHS,
        slashInactivityTargetPercentage: 0.8,
        slashGracePeriodL2Slots: SETUP_EPOCH_DURATION * EPOCH_DURATION, // do not slash during setup
        slashAmountSmall: SLASHING_UNIT,
        slashAmountMedium: SLASHING_UNIT * 2n,
        slashAmountLarge: SLASHING_UNIT * 3n,
        ...opts,
      },
    });
    return new P2PInactivityTest(test, opts);
  }

  public async setup() {
    await this.test.applyBaseSnapshots();
    await this.test.setup();

    // Set slashing penalties for inactivity
    const { rollup } = await this.test.getContracts();
    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - SLASHING_AMOUNT).toBeLessThan(biggestEjection);
    this.test.ctx.aztecNodeConfig.slashInactivityPenalty = SLASHING_AMOUNT;
    this.rollup = rollup;

    if (!this.keepInitialNode) {
      await this.test.ctx.aztecNode.stop();
    }

    // Create all active nodes
    this.activeNodes = await createNodes(
      this.test.ctx.aztecNodeConfig,
      this.test.ctx.dateProvider,
      this.test.bootstrapNodeEnr,
      NUM_NODES - this.inactiveNodeCount - Number(this.keepInitialNode),
      BOOT_NODE_UDP_PORT,
      this.test.prefilledPublicData,
      this.dataDir,
      undefined,
      Number(this.keepInitialNode),
    );

    // And the ones with an initially disabled sequencer
    const inactiveConfig = { ...this.test.ctx.aztecNodeConfig, dontStartSequencer: true };
    this.inactiveNodes = await createNodes(
      inactiveConfig,
      this.test.ctx.dateProvider,
      this.test.bootstrapNodeEnr,
      this.inactiveNodeCount,
      BOOT_NODE_UDP_PORT,
      this.test.prefilledPublicData,
      this.dataDir,
      undefined,
      NUM_NODES - this.inactiveNodeCount,
    );

    this.nodes = [
      ...(this.keepInitialNode ? [this.test.ctx.aztecNode] : []),
      ...this.activeNodes,
      ...this.inactiveNodes,
    ];

    if (this.nodes.length !== NUM_NODES) {
      throw new Error(`Expected ${NUM_NODES} nodes but got ${this.nodes.length}`);
    }

    this.offlineValidators = this.test.validators
      .slice(this.test.validators.length - this.inactiveNodeCount)
      .map(a => a.attester);

    this.test.logger.warn(`Setup complete. Offline validators are ${this.offlineValidators.join(', ')}.`, {
      validators: this.test.validators,
      offlineValidators: this.offlineValidators,
    });

    this.test.logger.warn(`Advancing to epoch ${SETUP_EPOCH_DURATION + 1} to start slashing`);
    await this.test.ctx.cheatCodes.rollup.advanceToEpoch(SETUP_EPOCH_DURATION + 1);

    return this;
  }

  public async teardown() {
    await this.test.stopNodes(this.nodes);
    await this.test.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${this.dataDir}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  }

  public get ctx() {
    return this.test.ctx;
  }

  public get logger() {
    return this.test.logger;
  }

  public get slashingAmount() {
    return SLASHING_AMOUNT;
  }
}
