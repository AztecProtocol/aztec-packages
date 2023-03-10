import { RollupArchiver } from './rollup_archiver.js';

describe('RollupArchiver', () => {
  const ethHost = 'http://localhost:8545/';
  const rollupContractAddress = '0x0000000000000000000000000000000000000000';

  it('can start and stop', async () => {
    const rollupArchiver = new RollupArchiver(ethHost, rollupContractAddress);
    rollupArchiver.start();
    await rollupArchiver.stop();
  });

  it('successfully syncs', async () => {
    // TODO: implement once the TS mocks are replaced with actual data
  });
});
