import type { AztecNodeConfig } from '@aztec/aztec-node';
import { Fr, type Logger, retryUntil, sleep } from '@aztec/aztec.js';
import { tryRmDir } from '@aztec/foundation/fs';
import { downloadEpochProvingJob, rerunEpochProvingJob } from '@aztec/prover-node';
import type { TestProverNode } from '@aztec/prover-node/test';

import { jest } from '@jest/globals';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { getACVMConfig } from '../fixtures/get_acvm_config.js';
import { getBBConfig } from '../fixtures/get_bb_config.js';
import type { EndToEndContext } from '../fixtures/utils.js';
import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

describe('e2e_epochs/epochs_upload_failed_proof', () => {
  let context: EndToEndContext;
  let logger: Logger;
  let config: AztecNodeConfig;

  let uploadPath: string;
  let uploadUrl: string;
  let rerunDataDir: string;
  let rerunDownloadDir: string;

  let test: EpochsTestContext;

  beforeEach(async () => {
    rerunDataDir = await mkdtemp(join(tmpdir(), 'rerun-data-'));
    rerunDownloadDir = await mkdtemp(join(tmpdir(), 'rerun-download-'));
    uploadPath = await mkdtemp(join(tmpdir(), 'failed-proofs-'));
    uploadUrl = `file://${uploadPath}`;

    test = await EpochsTestContext.setup({ proverNodeConfig: { proverNodeFailedEpochStore: uploadUrl } });
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

  it('uploads failed proving job state and re-runs it on a fresh instance', async () => {
    // Make initial prover node fail to prove
    const proverNode = test.proverNodes[0] as TestProverNode;
    const proverManager = proverNode.getProver();
    const origCreateEpochProver = proverManager.createEpochProver.bind(proverManager);
    proverManager.createEpochProver = () => {
      const epochProver = origCreateEpochProver();
      epochProver.finaliseEpoch = async () => {
        await sleep(1000);
        logger.warn(`Triggering error on finaliseEpoch`);
        throw new Error(`Fake error while proving epoch`);
      };
      return epochProver;
    };

    // And track when the epoch failure upload is complete
    let epochUploadUrl: string | undefined = undefined;
    const origTryUploadEpochFailure = proverNode.tryUploadEpochFailure.bind(proverNode);
    proverNode.tryUploadEpochFailure = async (job: any) => {
      epochUploadUrl = await origTryUploadEpochFailure(job);
      return epochUploadUrl;
    };

    // Wait until the start of epoch one so prover node starts proving epoch 0,
    // and wait for the data to be uploaded to the remote file store
    await test.waitUntilEpochStarts(1);
    await retryUntil(() => epochUploadUrl !== undefined, 'Upload epoch failure', 120, 1);

    // Stop everything, we're going to prove on a fresh instance
    await test.teardown();

    const rerunDownloadPath = join(rerunDownloadDir, 'data.bin');
    logger.warn(`Downloading epoch proving job data and state`, { uploadPath, rerunDataDir, rerunDownloadPath });
    await downloadEpochProvingJob(epochUploadUrl!, logger, {
      dataDirectory: rerunDataDir,
      jobDataDownloadPath: rerunDownloadPath,
    });

    logger.warn(`Rerunning proving job from ${rerunDownloadPath}`);
    await rerunEpochProvingJob(rerunDownloadPath, logger, {
      ...config,
      realProofs: false,
      dataStoreMapSizeKB: 1024 * 1024,
      dataDirectory: rerunDataDir,
      proverAgentCount: 2,
      proverId: Fr.random(),
      ...(await getACVMConfig(logger)),
      ...(await getBBConfig(logger)),
    });

    logger.info(`Test succeeded`);
  });
});
