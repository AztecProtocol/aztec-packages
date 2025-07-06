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
      Fr.fromHexString('0x2b085608d6971fd437ea676a08ba5064f8d774f852ffdb7abc0fe5f1e0767101'),
    );
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x1d01d2a9acdecb1c3ba8e161659b4a3550e7442aa3637d116526b2cf3797ad5f'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x2ccb5ec1c0b0a1f72ae4bbb0cd683b57646318e2c18579c2863e43a1fc0d52c4'),
    );
  });
});
