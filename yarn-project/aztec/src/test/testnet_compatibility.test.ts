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
      Fr.fromHexString('0x0e2e6c4d10217164a23a4aaf85fbe858244709f30de4c36650a99987b89e44cc'),
    );
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x2cd0246f0e844fceef7d1125aedbda185bc0c3819b961018fb9e6d8558a56be3'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x02b00d270bbe1e997224475fb3e3b1cd04a7fee2c6aef6a82d887dc13dbcd2bb'),
    );
  });
});
