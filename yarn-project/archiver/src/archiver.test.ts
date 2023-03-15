import { getAddress } from 'viem';
import { Archiver } from './archiver.js';

describe('Archiver', () => {
  const ethHost = new URL('http://localhost:8545/');
  const rollupAddress = getAddress('0x0000000000000000000000000000000000000000');
  const yeeterAddress = getAddress('0x0000000000000000000000000000000000000000');

  it('can start and stop', async () => {
    const archiver = new Archiver(ethHost, rollupAddress, yeeterAddress);
    await archiver.start();
    archiver.stop();
  });

  it('successfully syncs', async () => {
    // TODO: implement once the TS mocks are replaced with actual data
  });
});
