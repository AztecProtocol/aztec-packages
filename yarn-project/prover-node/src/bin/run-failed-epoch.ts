/* eslint-disable no-console */
import type { L1ContractAddresses } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { downloadEpochProvingJob, getProverNodeConfigFromEnv, rerunEpochProvingJob } from '@aztec/prover-node';
import { type UploadSnapshotMetadata, UploadSnapshotMetadataSchema } from '@aztec/stdlib/snapshots';

import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { basename, join } from 'path';

const logger = createLogger('prover-node:run-failed-epoch');

function printUsage() {
  console.error('Usage: run-failed-epoch <proof-uri> [out-dir=./data]');
}

async function rerunFailedEpoch(provingJobUrl: string, baseLocalDir: string) {
  const localDir = join(baseLocalDir, basename(provingJobUrl));
  const jobPath = join(localDir, 'data.bin');
  const dataDir = join(localDir, 'state');

  const env = getProverNodeConfigFromEnv();
  const config = {
    ...getProverNodeConfigFromEnv(),
    dataDirectory: dataDir,
    dataStoreMapSizeKB: env.dataStoreMapSizeKB ?? 1024 * 1024,
    proverId: env.proverId ?? Fr.random(),
  };

  let metadata: UploadSnapshotMetadata;
  const metadataPath = join(localDir, 'metadata.json');
  if (existsSync(metadataPath)) {
    logger.info(`Using downloaded data`);
    metadata = jsonParseWithSchema(await readFile(metadataPath, 'utf-8'), UploadSnapshotMetadataSchema);
  } else {
    logger.info(`Downloading epoch proving job data and state from ${provingJobUrl} to ${localDir}`);
    metadata = await downloadEpochProvingJob(provingJobUrl!, logger, {
      jobDataDownloadPath: jobPath,
      dataDirectory: dataDir,
    });
    await writeFile(metadataPath, jsonStringify(metadata, true));
    logger.info(`Download to ${localDir} complete`);
  }

  logger.info(`Rerunning proving job from ${jobPath} with state from ${dataDir}`, metadata);
  const result = await rerunEpochProvingJob(jobPath, logger, {
    ...config,
    l1Contracts: { rollupAddress: metadata.rollupAddress } as L1ContractAddresses,
    rollupVersion: metadata.rollupVersion,
  });

  console.error(`Epoch proving job complete with result ${result}`);
}

async function main() {
  if (process.argv[2] === '--help') {
    printUsage();
    return;
  }

  const uri = process.argv[2];
  const outDir = process.argv[3] || './data';
  if (!uri) {
    printUsage();
    throw new Error('Missing URL to epoch proving job');
  }

  mkdirSync(outDir, { recursive: true });
  await rerunFailedEpoch(uri, outDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
