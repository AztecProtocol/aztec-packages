import { promiseWithResolvers } from '@aztec/foundation/promise';
import type { AztecNode, AztecNodeAdmin, AztecNodeAdminConfig } from '@aztec/stdlib/interfaces/client';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import { mock } from 'jest-mock-extended';

import { type BotConfig, getBotDefaultConfig } from './config.js';
import { BotFactory } from './factory.js';
import type { BotStore } from './store/index.js';

class TestBotFactory extends BotFactory {
  public override withNoMinTxsPerBlock<T>(fn: () => Promise<T>): Promise<T> {
    return super.withNoMinTxsPerBlock(fn);
  }
}

describe('BotFactory.withNoMinTxsPerBlock', () => {
  let minTxsPerBlock: number | undefined;
  let setConfigCalls: (number | undefined)[];
  let factory: TestBotFactory;

  beforeEach(() => {
    minTxsPerBlock = 3;
    setConfigCalls = [];

    const aztecNodeAdmin = mock<AztecNodeAdmin>();
    aztecNodeAdmin.getConfig.mockImplementation(() => Promise.resolve({ minTxsPerBlock } as AztecNodeAdminConfig));
    aztecNodeAdmin.setConfig.mockImplementation(config => {
      setConfigCalls.push(config.minTxsPerBlock);
      minTxsPerBlock = config.minTxsPerBlock;
      return Promise.resolve();
    });

    const config: BotConfig = { ...getBotDefaultConfig(), flushSetupTransactions: true };
    const wallet = mock<EmbeddedWallet>();
    factory = new TestBotFactory(config, wallet, mock<BotStore>(), mock<AztecNode>(), aztecNodeAdmin);
  });

  it('zeroes minTxsPerBlock around a call and restores it after', async () => {
    await factory.withNoMinTxsPerBlock(() => {
      expect(minTxsPerBlock).toBe(0);
      return Promise.resolve();
    });

    expect(setConfigCalls).toEqual([0, 3]);
    expect(minTxsPerBlock).toBe(3);
  });

  it('zeroes once and restores once across overlapping calls', async () => {
    const gates = [promiseWithResolvers<void>(), promiseWithResolvers<void>(), promiseWithResolvers<void>()];
    const calls = gates.map(gate => factory.withNoMinTxsPerBlock(() => gate.promise));

    gates[0].resolve();
    await calls[0];
    expect(minTxsPerBlock).toBe(0);

    gates[1].resolve();
    await calls[1];
    expect(minTxsPerBlock).toBe(0);

    gates[2].resolve();
    await calls[2];
    expect(setConfigCalls).toEqual([0, 3]);
    expect(minTxsPerBlock).toBe(3);
  });

  it('restores minTxsPerBlock when the wrapped call fails', async () => {
    await expect(factory.withNoMinTxsPerBlock(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    expect(setConfigCalls).toEqual([0, 3]);
    expect(minTxsPerBlock).toBe(3);
  });

  it('restores minTxsPerBlock when one of several overlapping calls fails', async () => {
    const gate = promiseWithResolvers<void>();
    const failing = factory.withNoMinTxsPerBlock(() => Promise.reject(new Error('boom')));
    const succeeding = factory.withNoMinTxsPerBlock(() => gate.promise);

    await expect(failing).rejects.toThrow('boom');
    expect(minTxsPerBlock).toBe(0);

    gate.resolve();
    await succeeding;
    expect(setConfigCalls).toEqual([0, 3]);
    expect(minTxsPerBlock).toBe(3);
  });
});
