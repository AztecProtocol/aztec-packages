import type { AztecNodeService } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js';
import { RollupContract } from '@aztec/ethereum';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { jest } from '@jest/globals';
import fs from 'fs';
import 'jest-extended';
import os from 'os';
import path from 'path';

import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';

const NUM_NODES = 5;
const NUM_VALIDATORS = NUM_NODES + 1; // We create an extra validator, who will not have a running node
const BOOT_NODE_UDP_PORT = 4500;
const EPOCH_DURATION = 2;
const SLASHING_QUORUM = 3;
const SLASHING_ROUND_SIZE = 4;
const ETHEREUM_SLOT_DURATION = 4;
const AZTEC_SLOT_DURATION = 8;
const SLASHING_UNIT = BigInt(1e18);
const SLASHING_AMOUNT = SLASHING_UNIT * 3n;

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'inactivity-slash-'));

jest.setTimeout(1000 * 60 * 10);

describe('e2e_p2p_inactivity_slash', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let rollup: RollupContract;
  let offlineValidator: EthAddress;

  beforeAll(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_inactivity_slash',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      startProverNode: true,
      initialConfig: {
        aztecTargetCommitteeSize: NUM_VALIDATORS,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        ethereumSlotDuration: ETHEREUM_SLOT_DURATION,
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        listenAddress: '127.0.0.1',
        minTxsPerBlock: 0,
        aztecEpochDuration: EPOCH_DURATION,
        validatorReexecute: false,
        sentinelEnabled: true,
        slashingQuorum: SLASHING_QUORUM,
        slashingRoundSizeInEpochs: SLASHING_ROUND_SIZE / EPOCH_DURATION,
        slashInactivityTargetPercentage: 0.5,
        slashAmountSmall: SLASHING_UNIT,
        slashAmountMedium: SLASHING_UNIT * 2n,
        slashAmountLarge: SLASHING_UNIT * 3n,
      },
    });

    await t.applyBaseSnapshots();
    await t.setup();

    // Set slashing penalties for inactivity
    ({ rollup } = await t.getContracts());
    const [activationThreshold, ejectionThreshold, localEjectionThreshold] = await Promise.all([
      rollup.getActivationThreshold(),
      rollup.getEjectionThreshold(),
      rollup.getLocalEjectionThreshold(),
    ]);
    const biggestEjection = ejectionThreshold > localEjectionThreshold ? ejectionThreshold : localEjectionThreshold;
    expect(activationThreshold - SLASHING_AMOUNT).toBeLessThan(biggestEjection);
    t.ctx.aztecNodeConfig.slashInactivityPenalty = SLASHING_AMOUNT;

    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES, // Note we do not create the last validator yet, so it shows as offline
      BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,

      DATA_DIR,
    );
    await t.removeInitialNode();

    offlineValidator = t.validators.at(-1)!.attester;
    t.logger.warn(`Setup complete. Offline validator is ${offlineValidator}.`, {
      validators: t.validators,
      offlineValidator,
    });
  });

  afterAll(async () => {
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  it('slashes inactive validator', async () => {
    const slashPromise = promiseWithResolvers<bigint>();
    rollup.listenToSlash(args => {
      t.logger.warn(`Slashed ${args.attester.toString()}`);
      expect(offlineValidator.toString()).toEqual(args.attester.toString());
      expect(args.amount).toEqual(SLASHING_AMOUNT);
      slashPromise.resolve(args.amount);
    });
    await slashPromise.promise;
  });
});
