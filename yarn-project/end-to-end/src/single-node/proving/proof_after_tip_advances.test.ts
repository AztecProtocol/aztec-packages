import type { Logger } from '@aztec/aztec.js/log';
import type { RollupContract } from '@aztec/ethereum/contracts';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import type { TestProverNode } from '@aztec/prover-node/test';

import { expect, jest } from '@jest/globals';

import { PROVING_SLOT_TIMING, setupWithProver } from '../setup.js';
import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: a prover node must still publish its full epoch proof after another prover has taken the proven
// tip past that epoch. The rollup accepts such a proof (it only requires the predecessor checkpoint to be
// proven) and pays out on it, since rewards go to the provers holding shares in the epoch's longest proven
// length and shares are registered on submission.
//
// SingleNodeTestContext with startProverNode=false: both prover nodes are created here so the gating hook
// is installed before either starts proving. The slow prover is held at `beforeTopTreeProve` while the fast
// one proves the same epoch and is then told to partially prove the next one, which moves the tip beyond
// the gated epoch's last checkpoint. Timing: ethSlot=4s, aztecSlot=12s (3 L1 slots), epoch=6, fake prover.
// proofSubmissionEpochs is raised to 2 so the gated epoch's submission window stays open across the whole
// sequence: at 1, the window closes one epoch after the gate engages, and a slow CI box would expire the
// session and mask the regression as a timeout instead of an unpublished proof.
describe('single-node/proving/proof_after_tip_advances', () => {
  let test: SingleNodeTestContext;
  let logger: Logger;
  let rollup: RollupContract;

  beforeEach(async () => {
    test = await setupWithProver({ startProverNode: false, aztecProofSubmissionEpochs: 2, ...PROVING_SLOT_TIMING });
    ({ logger, rollup } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  it('submits a full epoch proof after another prover proves into the next epoch', async () => {
    const fastProver = (await test.createProverNode({ dontStart: true })).getProverNode()! as TestProverNode;
    const slowProver = (await test.createProverNode({ dontStart: true })).getProverNode()! as TestProverNode;

    // Hold the slow prover just before it proves its top tree, so it is still sitting on an unpublished
    // epoch proof while the fast prover moves the proven tip past that epoch.
    const gate = promiseWithResolvers<void>();
    let gatedSession: ReturnType<TestProverNode['sessionManager']['allSessions']>[number] | undefined;
    slowProver.setSessionHooks({
      beforeTopTreeProve: async () => {
        // The hook takes no session argument, so identify the caller by state: `EpochSession` flips to
        // `awaiting-root` before awaiting this hook, so the calling session is the full session in that
        // state. Sessions opened for later epochs hit the same gate and sail through once released.
        const session = slowProver.sessionManager
          .allSessions()
          .find(s => s.getKind() === 'full' && s.getState() === 'awaiting-root');
        if (!session) {
          return;
        }
        gatedSession ??= session;
        logger.warn(`Top-tree proving gated — waiting for test to release`, { epoch: session.getEpochNumber() });
        await gate.promise;
      },
    });

    await Promise.all([fastProver.start(), slowProver.start()]);

    const gated = await retryUntil(
      () => Promise.resolve(gatedSession),
      'slow prover blocks at the proving gate',
      test.L2_SLOT_DURATION_IN_S * 12,
      0.5,
    );
    const epoch = gated.getEpochNumber();
    const checkpoints = gated.getCheckpoints();
    const epochLength = checkpoints.length;
    const lastCheckpoint = checkpoints[epochLength - 1].checkpoint.number;
    logger.info(`Slow prover holds a proof of epoch ${epoch}`, { epoch, epochLength, lastCheckpoint });

    // The fast prover proves the same epoch, taking the proven tip up to that epoch's last checkpoint.
    await test.waitUntilProvenCheckpointNumber(lastCheckpoint, test.L2_SLOT_DURATION_IN_S * 12);

    // Then have it partially prove the next epoch, which is what takes the tip beyond the gated epoch. The
    // call throws until the next epoch has a checkpoint of its own to prove.
    await retryUntil(
      async () => {
        try {
          await fastProver.startProof(EpochNumber(epoch + 1));
          return true;
        } catch (err) {
          logger.verbose(`Cannot start partial proof of epoch ${epoch + 1} yet: ${err}`);
          return false;
        }
      },
      `fast prover starts a partial proof of epoch ${epoch + 1}`,
      test.L2_SLOT_DURATION_IN_S * 6,
      1,
    );
    await retryUntil(
      () => Promise.resolve(test.monitor.provenCheckpointNumber > lastCheckpoint),
      `proven tip moves past checkpoint ${lastCheckpoint} of epoch ${epoch}`,
      test.L2_SLOT_DURATION_IN_S * 6,
      0.5,
    );

    // The gated proof now ends below the proven tip. It is still worth publishing, so the session must
    // reach L1 rather than settle as failed.
    logger.info(`Releasing the proving gate with the tip at ${test.monitor.provenCheckpointNumber}`);
    gate.resolve();

    await expect(gated.whenDone()).resolves.toEqual('completed');
    expect(await rollup.getHasSubmittedProof(epoch, epochLength, slowProver.getProverId())).toBe(true);
  });
});
