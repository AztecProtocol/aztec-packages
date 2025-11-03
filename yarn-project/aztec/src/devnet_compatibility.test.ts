import type { InitialAccountData } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js/fields';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractsHash } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

/**
 * This test suit makes sure that the code in the monorepo is still compatible with the latest version of testnet
 * Only update these values after a governance update that changes the protocol is enacted
 */
describe('Testnet compatibility', () => {
  it('has expected VK tree root', () => {
    const expectedRoots = [Fr.fromHexString('0x068a79e8b6d1c30b569b4b9b618e6485d6a075d6c9f4af0756cd0797cfa2ac41')];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts hash', () => {
    expect(protocolContractsHash).toEqual(
      Fr.fromHexString('0x27638bf36029626c609c64210f0e027e95b2975edc8359afa6f7a77974acf52a'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x15f4261b5018e6a2e8a302da6c30b004249c89301fbadca9ad2d82edaa7fb045'),
    );
  });
});
