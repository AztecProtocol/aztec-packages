import type { InitialAccountData } from '@aztec/accounts/testing';
import { Fr } from '@aztec/aztec.js';
import { getSponsoredFPCAddress } from '@aztec/cli/cli-utils';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { getGenesisValues } from '@aztec/world-state/testing';

/**
 * This test suit makes sure that the code in the monorepo is still compatible with the latest version of testnet
 * Only update these values after a governance update that changes the protocol is enacted
 */
describe('Testnet compatibility', () => {
  it('has expected VK tree root', () => {
    const expectedRoots = [Fr.fromHexString('0x229eadb7c540c82204b5373633d3c25557f8264ad8fca760660fe853e5275e39')];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x12e9aa367b065eff3e48912b8cae62209970117d34a8c9ef1e9e4116e41bc8d6'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x1fa3de2e35ec7d3dce2bbd63848d90ea140a98b5db8cfd531e7a50776976d1ec'),
    );
  });
});
