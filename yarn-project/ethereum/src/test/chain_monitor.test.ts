import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { RollupContract } from '../contracts/rollup.js';
import { ChainMonitor } from './chain_monitor.js';

describe('ChainMonitor', () => {
  describe('with noop runs', () => {
    let monitor: NoopChainMonitor;
    let rollupContract: MockProxy<RollupContract>;
    const logger = createLogger('test:chain_monitor');

    beforeEach(() => {
      rollupContract = mock<RollupContract>();
      monitor = new NoopChainMonitor(rollupContract, new DateProvider(), logger);
    });

    it('awaits for runs to finish before stopping', async () => {
      void monitor.safeRun();
      void monitor.safeRun();
      void monitor.safeRun();

      expect(monitor.counter).toEqual(3);
      await monitor.stop();
      expect(monitor.counter).toEqual(0);
    });
  });
});

class NoopChainMonitor extends ChainMonitor {
  public counter = 0;

  override async run() {
    this.counter++;
    await sleep(200);
    this.counter--;
    return this;
  }

  public override safeRun() {
    super.safeRun();
  }
}
