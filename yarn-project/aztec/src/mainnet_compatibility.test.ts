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
    const expectedRoots = [Fr.fromHexString('0x18e358ea5367f6069a4c1c08a2e0628fbb1b25c00b0b98160072d4ad397bae7c')];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractsHash).toEqual(
      Fr.fromHexString('0x2d0277dcfbd0213fa60233bb3edb87acabedcaff904a4e65830be9f30b881f70'),
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
      Fr.fromHexString('0x177a4955b31ecaafad999753938a44e526b54c5ba5d536688227f85f15cfbdf5'),
    );
  });
});
