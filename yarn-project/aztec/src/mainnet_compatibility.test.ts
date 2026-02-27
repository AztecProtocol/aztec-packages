import { Fr } from '@aztec/aztec.js/fields';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

/**
 * This test suit makes sure that the code in the monorepo is still compatible with the latest version of mainnet
 * Only update these values after a governance update that changes the protocol is enacted
 */
describe('Mainnet compatibility', () => {
  it('has expected VK tree root', () => {
    const expectedRoots = [Fr.fromHexString('0x2d0b15497929f5150c4c383993555456e60d27121f4ac2cb9ef880319f5f9a6f')];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractsHash).toEqual(
      Fr.fromHexString('0x249663cd4e6169509465518d5bc7e959b08e9f8d23fc2b0901d5c47ff4980ac8'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    // initial accounts get initial fee juice added to their balance
    const { genesisArchiveRoot } = await getGenesisValues(
      /* initial accounts */ [],
      /* initial fee juice */ Fr.ZERO,
      /* initial public data leaves */ [],
    );
    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x15684c8c3d2106918d3860f777e50555b7166adff47df13cc652e2e5a50bf5c7'),
    );
  });
});
