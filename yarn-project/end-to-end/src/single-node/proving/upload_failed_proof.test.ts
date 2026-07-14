import type { AztecNodeConfig } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { tryRmDir } from '@aztec/foundation/fs';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { downloadEpochProvingJob, rerunEpochProvingJob } from '@aztec/prover-node';
import type { TestProverNode } from '@aztec/prover-node/test';

import { jest } from '@jest/globals';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { getACVMConfig } from '../../fixtures/get_acvm_config.js';
import { getBBConfig } from '../../fixtures/get_bb_config.js';
import type { EndToEndContext } from '../../fixtures/utils.js';
import { PROVING_SLOT_TIMING, setupWithProver } from '../setup.js';
import { SingleNodeTestContext } from '../single_node_test_context.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: verifies that a failed epoch-proving job uploads its state to a file store and that
// rerunEpochProvingJob can re-prove from the downloaded data on a fresh instance. Uses
// SingleNodeTestContext with a prover configured to use a temp file:// URL as the epoch failure store.
// Timing: ethSlot=4s, aztecSlot=12s (3 L1 slots), epoch=6, proofSubmissionEpochs=1, fake prover. The
// test tears down mid-run and re-proves via a standalone helper.
describe('single-node/proving/upload_failed_proof', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let config: AztecNodeConfig;

  let uploadPath: string;
  let uploadUrl: string;
  let rerunDataDir: string;
  let rerunDownloadDir: string;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    rerunDataDir = await mkdtemp(join(tmpdir(), 'rerun-data-'));
    rerunDownloadDir = await mkdtemp(join(tmpdir(), 'rerun-download-'));
    uploadPath = await mkdtemp(join(tmpdir(), 'failed-proofs-'));
    uploadUrl = `file://${uploadPath}`;

    // Runs at the PROVING_SLOT_TIMING floor: the body waits in real wall-clock for the sequencer to build
    // epoch 0 before the prover finalizes it at the epoch-1 boundary and trips the failing top-tree-prove hook.
    test = await setupWithProver({
      proverNodeConfig: { proverNodeFailedEpochStore: uploadUrl },
      ...PROVING_SLOT_TIMING,
    });
    ({ context, logger } = test);
    ({ config } = context);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
    await tryRmDir(uploadPath, logger);
    await tryRmDir(rerunDataDir, logger);
    await tryRmDir(rerunDownloadDir, logger);
  });

  // Makes the prover's top-tree prove always throw so epoch 0 can never be proven. Under the
  // retry-to-converge model the session keeps re-attempting and failing; the post-mortem upload
  // fires only when epoch 0's proof-submission window closes, from expireEpoch. Intercepts
  // tryUploadEpochFailure to capture the upload URL, warps past that window, then tears down the
  // live context, downloads the proving job data, and re-runs it via rerunEpochProvingJob with fake
  // proofs on a fresh config.
  it('uploads failed proving job state and re-runs it on a fresh instance', async () => {
    // Make initial prover node fail to prove, via the session's top-tree-prove hook.
    const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
    proverNode.setSessionHooks({
      topTreeProveOverride: async () => {
        await sleep(1000);
        logger.warn(`Triggering error on top-tree prove`);
        throw new Error(`Fake error while proving epoch`);
      },
    });

    // Track when the epoch failure upload is complete. The upload now happens from the expiry path
    // (tryUploadEpochFailure(epoch, checkpoints)) rather than eagerly on a failed session.
    const { promise: epochUploaded, resolve: onEpochUploaded } = promiseWithResolvers<string>();
    const origTryUploadEpochFailure = proverNode.tryUploadEpochFailure.bind(proverNode);
    proverNode.tryUploadEpochFailure = async (epoch: any, checkpoints: any) => {
      const url = await origTryUploadEpochFailure(epoch, checkpoints);
      if (url !== undefined) {
        onEpochUploaded(url);
      }
      return url;
    };

    // Warp past epoch 0's proof-submission window (proofSubmissionEpochs=1 ⇒ epoch 0 expires at the
    // start of epoch 2). The failing prover never lands epoch 0, so expireEpoch uploads its
    // post-mortem to the remote file store.
    await test.warpToEpochStart(2);
    const epochUploadUrl = await epochUploaded;

    // Stop everything, we're going to prove on a fresh instance
    await test.teardown();

    const rerunDownloadPath = join(rerunDownloadDir, 'data.bin');
    logger.warn(`Downloading epoch proving job data and state`, { uploadPath, rerunDataDir, rerunDownloadPath });
    await downloadEpochProvingJob(epochUploadUrl, logger, {
      dataDirectory: rerunDataDir,
      jobDataDownloadPath: rerunDownloadPath,
    });

    logger.warn(`Rerunning proving job from ${rerunDownloadPath}`);
    await rerunEpochProvingJob(
      rerunDownloadPath,
      logger,
      {
        ...config,
        realProofs: false,
        dataStoreMapSizeKb: 1024 * 1024,
        dataDirectory: rerunDataDir,
        proverAgentCount: 2,
        proverId: EthAddress.random(),
        ...(await getACVMConfig(logger)),
        ...(await getBBConfig(logger)),
      },
      context.genesis,
    );

    logger.info(`Test succeeded`);
  });
});
