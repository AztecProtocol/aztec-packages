import { type L1ReaderConfig, l1ReaderConfigMappings } from '@aztec/ethereum/l1-reader';
import { type ConfigMappingsType, pickConfigMappings } from '@aztec/foundation/config';

export type BlobArchiveApiConfig = {
  archiveApiUrl?: string;
} & Partial<Pick<L1ReaderConfig, 'l1ChainId'>>;

export const blobArchiveApiConfigMappings: ConfigMappingsType<BlobArchiveApiConfig> = {
  archiveApiUrl: {
    env: 'BLOB_ARCHIVE_API_URL',
    description: 'The URL of the archive API',
  },
  ...pickConfigMappings(l1ReaderConfigMappings, ['l1ChainId']),
};
