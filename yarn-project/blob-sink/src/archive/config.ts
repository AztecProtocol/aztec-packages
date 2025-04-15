import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum';
import { type ConfigMappingsType, pickConfigMappings } from '@aztec/foundation/config';

export type BlobSinkArchiveApiConfig = {
  archiveApiUrl?: string;
} & Partial<Pick<L1ReaderConfig, 'l1ChainId'>>;

export const blobSinkArchiveApiConfigMappings: ConfigMappingsType<BlobSinkArchiveApiConfig> = {
  archiveApiUrl: {
    env: 'BLOB_SINK_ARCHIVE_API_URL',
    description: 'The URL of the archive API',
  },
  ...pickConfigMappings(l1ReaderConfigMappings, ['l1ChainId']),
};
