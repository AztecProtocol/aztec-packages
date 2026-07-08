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

  // Makes the prover's top-tree prove always throw (v5 uses the session's topTreeProveOverride hook;
  // pre-v5 it patched finalizeEpoch), intercepts tryUploadSessionFailure (pre-v5 tryUploadEpochFailure)
  // to capture the upload URL, then waits for epoch 1 to start and for the upload to complete. Tears
  // down the live context, downloads the proving job data, and re-runs it via rerunEpochProvingJob with
  // fake proofs on a fresh config.
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

    // And track when the epoch failure upload is complete
    const { promise: epochUploaded, resolve: onEpochUploaded } = promiseWithResolvers<string>();
    const origTryUploadEpochFailure = proverNode.tryUploadSessionFailure.bind(proverNode);
    proverNode.tryUploadSessionFailure = async (session: any) => {
      const url = await origTryUploadEpochFailure(session);
      if (url !== undefined) {
        onEpochUploaded(url);
      }
      return url;
    };

    // Warp to the start of epoch one so prover node starts proving epoch 0,
    // and wait for the data to be uploaded to the remote file store
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
});
