import { getConfigFromMappings } from '@aztec/foundation/config';

import { type SharedNodeConfig, sharedNodeConfigMappings } from './index.js';

describe('shared node config', () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = env;
  });

  it('defaults auto-shutdown to false', () => {
    const config = getConfigFromMappings<SharedNodeConfig>(sharedNodeConfigMappings);

    expect(config.enableAutoShutdown).toBe(false);
  });

  it('parses ENABLE_AUTO_SHUTDOWN', () => {
    process.env.ENABLE_AUTO_SHUTDOWN = 'true';

    const config = getConfigFromMappings<SharedNodeConfig>(sharedNodeConfigMappings);

    expect(config.enableAutoShutdown).toBe(true);
  });
});
