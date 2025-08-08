import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';

export type KeyStoreConfig = {
  keyStoreDirectory: string | undefined;
};

export const keyStoreConfigMappings: ConfigMappingsType<KeyStoreConfig> = {
  keyStoreDirectory: {
    env: 'KEY_STORE_DIRECTORY',
    description: 'Location of key store directory',
  },
};

export function getKeyStoreConfigFromEnv(): KeyStoreConfig {
  return getConfigFromMappings<KeyStoreConfig>(keyStoreConfigMappings);
}
