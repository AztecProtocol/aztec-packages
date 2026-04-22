import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { RollupContract } from '@aztec/ethereum/contracts';
import { EpochNumber } from '@aztec/foundation/branded-types';

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
const ETHEREUM_SLOT_DURATION = process.env.CI ? 8 : 4;
const AZTEC_SLOT_DURATION = ETHEREUM_SLOT_DURATION * 2;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;

// How many epochs it may take to set everything up, so we dont slash during this period
const SETUP_EPOCH_DURATION = 8;

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
        env: {
          AZTEC_TARGET_COMMITTEE_SIZE: String(COMMITTEE_SIZE),
          AZTEC_SLOT_DURATION: String(AZTEC_SLOT_DURATION),
          ETHEREUM_SLOT_DURATION: String(ETHEREUM_SLOT_DURATION),
          AZTEC_PROOF_SUBMISSION_EPOCHS: '1024',
          P2P_LISTEN_ADDR: '127.0.0.1',
          SEQ_MIN_TX_PER_BLOCK: '0',
          AZTEC_EPOCH_DURATION: String(EPOCH_DURATION),
          SENTINEL_ENABLED: 'true',
          AZTEC_SLASHING_QUORUM: String(SLASHING_QUORUM),
          AZTEC_SLASHING_ROUND_SIZE_IN_EPOCHS: String(SLASHING_ROUND_SIZE_IN_EPOCHS),
          SLASH_INACTIVITY_TARGET_PERCENTAGE: String(0.8),
          SLASH_GRACE_PERIOD_L2_SLOTS: String(SETUP_EPOCH_DURATION * EPOCH_DURATION),
          AZTEC_SLASH_AMOUNT_SMALL: String(SLASHING_UNIT),
          AZTEC_SLASH_AMOUNT_MEDIUM: String(SLASHING_UNIT * 2n),
          AZTEC_SLASH_AMOUNT_LARGE: String(SLASHING_UNIT * 3n),
        },
        anvilSlotsInAnEpoch: 4,
        proverNodeConfig: { proverNodeEpochProvingDelayMs: AZTEC_SLOT_DURATION * 1000 },
        ...opts,
      },
    });
    return new P2PInactivityTest(test, opts);
  }

  public async setup() {
    await this.test.setup();
    await this.test.applyBaseSetup();

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
      await this.test.ctx.aztecNodeService.stop();
    }

    // Create all active nodes
    this.activeNodes = await createNodes(
      this.test.ctx.aztecNodeConfig,
      this.test.ctx.dateProvider,
      this.test.bootstrapNodeEnr,
      NUM_NODES - this.inactiveNodeCount - Number(this.keepInitialNode),
      BOOT_NODE_UDP_PORT,
      this.test.genesis,
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
      this.test.genesis,
      this.dataDir,
      undefined,
      NUM_NODES - this.inactiveNodeCount,
    );

    this.nodes = [
      ...(this.keepInitialNode ? [this.test.ctx.aztecNodeService] : []),
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

    // Wait for P2P mesh to be fully formed before starting slashing period
    // This prevents race conditions where validators propose blocks before the network is ready
    await this.test.waitForP2PMeshConnectivity(this.nodes, NUM_NODES);

    this.test.logger.warn(`Advancing to epoch ${SETUP_EPOCH_DURATION - 1} (slashing will start after it is completed)`);
    await this.test.ctx.cheatCodes.rollup.advanceToEpoch(EpochNumber(SETUP_EPOCH_DURATION - 1));

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
