import type { AztecNodeConfig } from '@aztec/aztec-node';
import { EthAddress } from '@aztec/aztec.js/addresses';
import type { Logger } from '@aztec/aztec.js/log';
import { tryRmDir } from '@aztec/foundation/fs';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { downloadEpochProvingJob, rerunCheckpointProvingJob, rerunEpochProvingJob } from '@aztec/prover-node';
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

  // Makes the prover's top-tree prove always throw. Because every checkpoint prover still succeeds, the
  // session fails on its own account (state 'failed'), which the session manager treats as a genuine,
  // race-free failure and uploads a post-mortem eagerly via tryUploadEpochFailure(sessionId, checkpoints).
  // Intercepts that to capture the upload URL, then tears down the live context, downloads the proving
  // job data, and re-runs it via rerunEpochProvingJob with fake proofs on a fresh config.
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

    // Track when the epoch failure upload is complete. It fires eagerly when a full session fails with
    // healthy provers (a top-tree failure here).
    const { promise: epochUploaded, resolve: onEpochUploaded } = promiseWithResolvers<string>();
    const origTryUploadEpochFailure = proverNode.tryUploadEpochFailure.bind(proverNode);
    proverNode.tryUploadEpochFailure = async (id: any, checkpoints: any) => {
      const url = await origTryUploadEpochFailure(id, checkpoints);
      if (url !== undefined) {
        onEpochUploaded(url);
      }
      return url;
    };

    // Warp to the start of epoch one so the prover node starts proving, fails at the top tree, and
    // uploads the failed proving-job data to the remote file store.
    await test.warpToEpochStart(1);
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

  // Same shape as above, one level down: forces a single checkpoint's sub-tree to fail (every checkpoint
  // prover fails, via the test hook), which uploads that checkpoint's proving data on its own. Intercepts
  // tryUploadCheckpointFailure for the URL, then downloads and re-proves just that checkpoint via
  // rerunCheckpointProvingJob (no epoch top-tree / L1 submit).
  it('uploads failed checkpoint proving state and re-proves it on a fresh instance', async () => {
    const proverNode = test.proverNodes[0].getProverNode() as TestProverNode;
    proverNode.setCheckpointHooks({
      checkpointProveOverride: async () => {
        await sleep(1000);
        logger.warn(`Triggering error on checkpoint sub-tree prove`);
        throw new Error(`Fake error while proving checkpoint`);
      },
    });

    // The checkpoint post-mortem upload fires eagerly when a CheckpointProver's block proofs reject.
    const { promise: checkpointUploaded, resolve: onCheckpointUploaded } = promiseWithResolvers<string>();
    const origTryUploadCheckpointFailure = proverNode.tryUploadCheckpointFailure.bind(proverNode);
    proverNode.tryUploadCheckpointFailure = async (prover: any) => {
      const url = await origTryUploadCheckpointFailure(prover);
      if (url !== undefined) {
        onCheckpointUploaded(url);
      }
      return url;
    };

    // Warp so the prover node starts registering checkpoints; the first one's sub-tree fails and uploads.
    await test.warpToEpochStart(1);
    const checkpointUploadUrl = await checkpointUploaded;

    await test.teardown();

    const rerunDownloadPath = join(rerunDownloadDir, 'data.bin');
    logger.warn(`Downloading checkpoint proving job data and state`, { rerunDataDir, rerunDownloadPath });
    await downloadEpochProvingJob(checkpointUploadUrl, logger, {
      dataDirectory: rerunDataDir,
      jobDataDownloadPath: rerunDownloadPath,
    });

    logger.warn(`Rerunning checkpoint proving job from ${rerunDownloadPath}`);
    await rerunCheckpointProvingJob(
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
