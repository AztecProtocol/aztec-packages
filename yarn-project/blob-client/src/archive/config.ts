import { type L1ChainIdConfig, l1ChainIdConfigMappings } from '@aztec/ethereum/l1-reader';
import { type ConfigMapping, type ConfigMappingsType, composeConfigMappings } from '@aztec/foundation/config';

export interface BlobArchiveApiConfig extends Partial<L1ChainIdConfig> {
  archiveApiUrl?: string;
}

export const blobArchiveApiConfigMappings: ConfigMappingsType<BlobArchiveApiConfig> = composeConfigMappings(
  {
    archiveApiUrl: {
      env: 'BLOB_ARCHIVE_API_URL',
      description: 'The URL of the archive API',
    } as ConfigMapping<string>,
  },
  l1ChainIdConfigMappings,
);
