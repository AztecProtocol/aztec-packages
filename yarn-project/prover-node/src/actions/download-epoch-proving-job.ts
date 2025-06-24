import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import type { Logger } from '@aztec/foundation/log';
import { urlJoin } from '@aztec/foundation/string';
import { snapshotSync } from '@aztec/node-lib/actions';
import { createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import { UploadSnapshotMetadataSchema, makeSnapshotPaths } from '@aztec/stdlib/snapshots';

import { readFileSync } from 'fs';

import { deserializeEpochProvingJobData } from '../job/epoch-proving-job-data.js';

/**
 * Given a location returned by `uploadEpochProofFailure`, downloads the world state and archiver snapshots
 * and the proving job data, so we can re-run the job later using `rerunEpochProvingJob`. This is decoupled
 * from actually proving so we can download once and run multiple times.
 */
export async function downloadEpochProvingJob(
  location: string,
  log: Logger,
  config: {
    dataDirectory: string;
    jobDataDownloadPath: string;
  },
) {
  log.info(`Downloading epoch proving job data from ${location}`);
  const fileStore = await createReadOnlyFileStore(location);
  const metadataUrl = urlJoin(location, 'metadata.json');
  const metadataRaw = await fileStore.read(metadataUrl);
  const metadata = jsonParseWithSchema(metadataRaw.toString(), UploadSnapshotMetadataSchema);

  const dataUrls = makeSnapshotPaths(location);
  log.info(`Downloading state snapshot from ${location} to local data directory`, { metadata, dataUrls });
  await snapshotSync({ dataUrls }, log, { ...config, ...metadata, snapshotsUrl: location });

  const dataPath = urlJoin(location, 'data.bin');
  const localPath = config.jobDataDownloadPath;
  log.info(`Downloading epoch proving job data from ${dataPath} to ${localPath}`);
  await fileStore.download(dataPath, localPath);

  const jobData = deserializeEpochProvingJobData(readFileSync(localPath));
  log.info(`Epoch proving job data for epoch ${jobData.epochNumber} downloaded successfully`);

  return metadata;
}
