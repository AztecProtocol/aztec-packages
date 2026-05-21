import {
  type ConfigMappingsType,
  booleanConfigHelper,
  composeConfigMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';
import { type NodeRPCConfig, nodeRpcConfigMappings } from '@aztec/stdlib/config';

type OwnApiConfig = {
  port: number;
  adminPort: number;
  adminApiKeyHash: string | undefined;
  disableAdminApiKey: boolean;
  resetAdminApiKey: boolean;
  nodeDebug: boolean;
  apiPrefix: string;
};

export type ApiConfig = OwnApiConfig & NodeRPCConfig;

const ownApiConfigMappings: ConfigMappingsType<OwnApiConfig> = {
  port: {
    env: 'AZTEC_PORT',
    description: 'Port to run the Aztec Services on',
    ...numberConfigHelper(8080),
  },
  adminPort: {
    env: 'AZTEC_ADMIN_PORT',
    description: 'Port to run admin APIs of Aztec Services on',
    ...numberConfigHelper(8880),
  },
  adminApiKeyHash: {
    env: 'AZTEC_ADMIN_API_KEY_HASH',
    description:
      'SHA-256 hex hash of a pre-generated admin API key. When set, the node uses this hash for authentication instead of auto-generating a key.',
  },
  disableAdminApiKey: {
    env: 'AZTEC_DISABLE_ADMIN_API_KEY',
    description:
      'Disable API key authentication on the admin RPC endpoint. By default, a key is auto-generated, displayed once, and its hash is persisted.',
    ...booleanConfigHelper(false),
  },
  resetAdminApiKey: {
    env: 'AZTEC_RESET_ADMIN_API_KEY',
    description:
      'Force-generate a new admin API key, replacing any previously persisted key hash. The new key is displayed once at startup.',
    ...booleanConfigHelper(false),
  },
  nodeDebug: {
    env: 'AZTEC_NODE_DEBUG',
    description: 'Expose debug endpoints (e.g. mineBlock) on the main RPC port',
    ...booleanConfigHelper(false),
  },
  apiPrefix: {
    env: 'API_PREFIX',
    description: 'Prefix for API routes on any service that is started',
    defaultValue: '',
  },
};

export const apiConfigMappings: ConfigMappingsType<ApiConfig> = composeConfigMappings(
  ownApiConfigMappings,
  nodeRpcConfigMappings,
);
