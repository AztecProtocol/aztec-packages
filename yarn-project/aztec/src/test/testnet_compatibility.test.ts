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
    expect(getVKTreeRoot()).toEqual(
      Fr.fromHexString('0x1077d4a3bdaf7a197f11cf08170dea38311ed462aaa367fef18e1f0fd3b21197'),
    );
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x0ef0ebce007b13ba690a833063974936ba993b1d97d31029b77ddef6d5cf6082'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x061fcea3035f57cfbd84f085e8f9801f5e4b73833e1eb2d3fe160cc82a3bfbe4'),
    );
  });
});
