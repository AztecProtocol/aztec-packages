import { getAddress } from 'viem';
import { DataArchiver } from './data_archiver.js';

describe('DataArchiver', () => {
  const ethHost = 'http://localhost:8545/';
  const rollupAddress = getAddress('0x0000000000000000000000000000000000000000');
  const yeeterAddress = getAddress('0x0000000000000000000000000000000000000000');

  it('can start and stop', async () => {
    const dataArchiver = new DataArchiver(ethHost, rollupAddress, yeeterAddress);
    await dataArchiver.start();
    dataArchiver.stop();
  });

  it('successfully syncs', async () => {
    // TODO: implement once the TS mocks are replaced with actual data
  });
});
