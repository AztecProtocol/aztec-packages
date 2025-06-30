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
    const expectedRoots = [
      Fr.fromHexString('0x1a5079b513266d78cf61cc98914d568e800982d8b2b9fe79c90f47ce27ffa2ec'),
      Fr.fromHexString('0x19e3d93ad6369e960f28fdda0da5110129c2db67f49445d8406001eab1a1ae6a'), // the AVM is disabled on ARM and that leads to a different VK tree root. Not ideal but we don't support proving on ARM for now.
    ];
    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x00d0980697e140a074810b2bee11c5042763b87e95bfdbf2f28269c79e6abad6'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x0c9e36febecc59064f9a3cb93cdcd52cc89d2bcdc2822d5c5eac11b94a2c2a7c'),
    );
  });
});
