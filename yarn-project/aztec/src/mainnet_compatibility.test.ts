import { Fr } from '@aztec/aztec.js/fields';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

/**
 * This test suit makes sure that the code in the monorepo is still compatible with the latest version of mainnet
 * Only update these values after a governance update that changes the protocol is enacted
 */
// TODO: temporarily skipped on v5-next, which carries unreleased protocol circuit changes that
// shift the VK tree root, protocol contracts hash and genesis roots away from the live mainnet
// values. Re-enable (and refresh the expected values) once we cut the first RC.
describe.skip('Mainnet compatibility', () => {
  it('has expected VK tree root', () => {
    const expectedRoots = [Fr.fromHexString('0x1e6494058514e655b4c479e25dc41590b7db8179f2fd71af38cee41f09b895c6')];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractsHash).toEqual(
      Fr.fromHexString('0x2672340d9a0107a7b81e6d10d25b854debe613f3272e8738e8df0ca2ff297141'),
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
