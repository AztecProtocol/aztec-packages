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

  it('parses SecretValue arrays from CLI for ETHEREUM consensus keys', () => {
    const cmd = buildCommandWith(['ETHEREUM']);
    cmd.parse(['node', 'cli', '--l1-consensus-host-api-keys', 'k1, k2']);
    const opts = cmd.opts();
    const keys = opts.l1ConsensusHostApiKeys as SecretValue<string>[];
    expect(Array.isArray(keys)).toBe(true);
    expect(keys.map(k => k.getValue())).toEqual(['k1', 'k2']);
  });

  it('captures local-network flags passed explicitly on CLI', () => {
    const cmd = buildCommandWith(['LOCAL_NETWORK']);
    cmd.parse(['node', 'cli', '--localNetwork.testAccounts', 'false']);
    const opts = cmd.opts();
    expect(opts['localNetwork.testAccounts']).toBe(false);
  });

  it('parses --localNetwork.l1Mnemonic into a SecretValue', () => {
    const cmd = buildCommandWith(['LOCAL_NETWORK']);
    cmd.parse(['node', 'cli', '--localNetwork.l1Mnemonic', 'word1 word2 word3']);
    const opts = cmd.opts();
    const mnemonic = opts['localNetwork.l1Mnemonic'] as SecretValue<string>;
    expect(mnemonic).toBeInstanceOf(SecretValue);
    expect(mnemonic.getValue()).toBe('word1 word2 word3');
  });

  it('auto-generates --localNetwork.* flags for genesis state config', () => {
    const cmd = buildCommandWith(['LOCAL_NETWORK']);
    // sponsoredFPC and prefundAddresses come from genesisStateConfigMappings and are now
    // auto-exposed under --localNetwork.* since they only matter for fresh-chain init.
    cmd.parse(['node', 'cli', '--localNetwork.sponsoredFPC', 'true', '--localNetwork.prefundAddresses', '0x1,0x2']);
    const opts = cmd.opts();
    expect(opts['localNetwork.sponsoredFPC']).toBe(true);
    expect(opts['localNetwork.prefundAddresses']).toEqual(['0x1', '0x2']);
  });

  it('parses optional boolean flag values', () => {
    expect(buildCommandWith(['P2P SUBSYSTEM']).parse(['node', 'cli', '--p2p-enabled']).opts().p2pEnabled).toBe(true);
    expect(buildCommandWith(['P2P SUBSYSTEM']).parse(['node', 'cli', '--p2p-enabled', 'false']).opts().p2pEnabled).toBe(
      false,
    );
    expect(buildCommandWith(['P2P SUBSYSTEM']).parse(['node', 'cli']).opts().p2pEnabled).toBeUndefined();
  });

  it('captures explicit numeric P2P port flag', () => {
    const cmd = buildCommandWith(['P2P SUBSYSTEM']);
    cmd.parse(['node', 'cli', '--p2p.p2pPort', String(DEFAULT_P2P_PORT)]);
    const opts = cmd.opts();
    expect(opts['p2p.p2pPort']).toBe(DEFAULT_P2P_PORT);
    expect(typeof opts['p2p.p2pPort']).toBe('number');
  });
});
