import { type ConfigMappingsType, booleanConfigHelper, numberConfigHelper } from '@aztec/foundation/config';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { apiConfigMappings } from './api_config.js';
import { createConfigResolver } from './util.js';

interface TestConfig {
  port: number;
  enabled: boolean;
  dataDirectory: string;
}

// Use real registered env var names to satisfy the EnvVar branded type
const testMappings: ConfigMappingsType<TestConfig> = {
  port: {
    env: 'AZTEC_PORT',
    description: 'aztec port',
    ...numberConfigHelper(8080),
  },
  enabled: {
    env: 'P2P_ENABLED',
    description: 'is enabled',
    ...booleanConfigHelper(false),
  },
  dataDirectory: {
    env: 'DATA_DIRECTORY',
    description: 'data directory',
    defaultValue: '/tmp/aztec',
  },
};

describe('createConfigResolver', () => {
  let savedEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    savedEnv = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = savedEnv;
  });

  it('applies mapping defaults when no layers provide a value', () => {
    const resolve = createConfigResolver({}, undefined, {});
    const config = resolve(testMappings);
    expect(config.port).toBe(8080);
    expect(config.enabled).toBe(false);
    expect(config.dataDirectory).toBe('/tmp/aztec');
  });

  it('ENV beats mapping defaults', () => {
    process.env.AZTEC_PORT = '9090';
    const resolve = createConfigResolver({}, undefined, {});
    const config = resolve(testMappings);
    expect(config.port).toBe(9090);
  });

  it('CLI beats ENV', () => {
    process.env.AZTEC_PORT = '9090';
    const resolve = createConfigResolver({ port: 1234 }, undefined, {});
    const config = resolve(testMappings);
    expect(config.port).toBe(1234);
  });

  it('chain config layer sits between ENV and mapping defaults', () => {
    const chainLayer = { AZTEC_PORT: '7777' };

    const resolveWithEnv = createConfigResolver({}, undefined, chainLayer);
    process.env.AZTEC_PORT = '9090';
    expect(resolveWithEnv(testMappings).port).toBe(9090);

    delete process.env.AZTEC_PORT;
    const resolveWithoutEnv = createConfigResolver({}, undefined, chainLayer);
    expect(resolveWithoutEnv(testMappings).port).toBe(7777);
  });

  it('CLI namespace scoping ignores options from other namespaces', () => {
    const resolve = createConfigResolver({ 'api.port': 4444, 'other.port': 9999 }, undefined, {});
    const config = resolve(testMappings, 'api');
    expect(config.port).toBe(4444);
  });

  it('resolves API defaults through config mappings', () => {
    const resolve = createConfigResolver({}, undefined, {});
    const config = resolve(apiConfigMappings);
    expect(config.port).toBe(8080);
    expect(config.adminPort).toBe(8880);
    expect(config.disableAdminApiKey).toBe(false);
    expect(config.resetAdminApiKey).toBe(false);
    expect(config.nodeDebug).toBe(false);
  });
});
