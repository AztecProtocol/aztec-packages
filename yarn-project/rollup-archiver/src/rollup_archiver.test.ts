import { getAddress } from 'viem';
import { RollupArchiver } from './rollup_archiver.js';

describe('RollupArchiver', () => {
  const ethHost = 'http://localhost:8545/';
  const rollupAddress = getAddress('0x0000000000000000000000000000000000000000');
  const yeeterAddress = getAddress('0x0000000000000000000000000000000000000000');

  it('can start and stop', async () => {
    const rollupArchiver = new RollupArchiver(ethHost, rollupAddress, yeeterAddress);
    await rollupArchiver.start();
    rollupArchiver.stop();
  });

  it('successfully syncs', async () => {
    // TODO: implement once the TS mocks are replaced with actual data
  });
});
