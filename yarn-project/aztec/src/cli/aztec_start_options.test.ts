import { SecretValue } from '@aztec/foundation/config';
import { DEFAULT_P2P_PORT } from '@aztec/p2p/config';

import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Command } from 'commander';

import { aztecStartOptions } from './aztec_start_options.js';
import { addOptions } from './util.js';

function buildCommandWith(categories: (keyof typeof aztecStartOptions)[]): Command {
  const cmd = new Command('start');
  for (const cat of categories) {
    addOptions(cmd, aztecStartOptions[cat]);
  }
  return cmd;
}

describe('aztec_start_options commander integration', () => {
  let env: NodeJS.ProcessEnv;

  beforeEach(() => {
    env = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = env;
  });

  it('maps simple flags to expected option keys', () => {
    const cmd = buildCommandWith(['API', 'MISC']);
    cmd.parse(['node', 'cli', '--network', 'testnet', '--port', '1234']);
    const opts = cmd.opts();
    expect(opts.network).toBe('testnet');
    expect(opts.port).toBe(1234);
  });

  it('reads from the env', () => {
    process.env.NETWORK = 'testnet';
    const cmd = buildCommandWith(['API', 'MISC']);
    cmd.parse(['node', 'cli', '--port', '1234']);
    const opts = cmd.opts();
    expect(opts.network).toBe('testnet');
    expect(opts.port).toBe(1234);
  });

  it('maps namespaced flags to dotted keys', () => {
    const cmd = buildCommandWith(['P2P SUBSYSTEM']);
    cmd.parse(['node', 'cli', '--p2p.listenAddress', '1.2.3.4']);
    const opts = cmd.opts();
    expect(opts['p2p.listenAddress']).toBe('1.2.3.4');
  });

  it('parses array values for comma-separated flags', () => {
    const cmd = buildCommandWith(['ETHEREUM']);
    cmd.parse(['node', 'cli', '--l1-rpc-urls', 'http://a, http://b']);
    const opts = cmd.opts();
    expect(opts.l1RpcUrls).toEqual(['http://a', 'http://b']);
  });

  it('parses SecretValue arrays from env for ETHEREUM consensus keys', () => {
    process.env.L1_CONSENSUS_HOST_API_KEYS = 'k1, k2';
    const cmd = buildCommandWith(['ETHEREUM']);
    cmd.parse(['node', 'cli']);
    const opts = cmd.opts();
    const keys = opts.l1ConsensusHostApiKeys as SecretValue<string>[];
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.map(k => k.getValue())).toEqual(['k1', 'k2']);
  });

  it('does not set l1RpcUrls and l1ChainId by default', () => {
    const cmd = buildCommandWith(['ETHEREUM']);
    cmd.parse(['node', 'cli']);
    const opts = cmd.opts();
    expect(opts.l1ChainId).toBeUndefined();
    expect(opts.l1RpcUrls).toBeUndefined();
  });

  it('uses defaults when flags are missing (numeric defaults)', () => {
    const cmd = buildCommandWith(['API']);
    cmd.parse(['node', 'cli']);
    const opts = cmd.opts();
    expect(opts.port).toBe(8080);
    expect(opts.adminPort).toBe(8880);
  });

  it('uses environment variables when flags are missing', () => {
    process.env.AZTEC_PORT = '9090';
    const cmd = buildCommandWith(['API']);
    cmd.parse(['node', 'cli']);
    const opts = cmd.opts();
    // Parsed through parseVal into a number
    expect(opts.port).toBe(9090);
    expect(typeof opts.port).toBe('number');
  });

  it('parses optional boolean flag values', () => {
    const cmd = buildCommandWith(['P2P SUBSYSTEM']);

    expect(cmd.parse(['node', 'cli', '--p2p-enabled']).opts().p2pEnabled).toBe(true);
    expect(cmd.parse(['node', 'cli', '--p2p-enabled', 'false']).opts().p2pEnabled).toBe(false);
    expect(cmd.parse(['node', 'cli']).opts().p2pEnabled).toBe(false);
  });

  it('uses numeric defaults from P2P mappings', () => {
    const cmd = buildCommandWith(['P2P SUBSYSTEM']);
    cmd.parse(['node', 'cli']);
    const opts = cmd.opts();
    expect(opts['p2p.p2pPort']).toBe(DEFAULT_P2P_PORT);
    expect(typeof opts['p2p.p2pPort']).toBe('number');
  });
});
