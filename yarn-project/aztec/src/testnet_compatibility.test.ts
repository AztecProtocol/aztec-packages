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
    const expectedRoots = [Fr.fromHexString('0x1a5079b513266d78cf61cc98914d568e800982d8b2b9fe79c90f47ce27ffa2ec')];

    if (process.env.ACCEPT_DISABLED_AVM_VK_TREE_ROOT === '1') {
      expectedRoots.push(
        //  Accept the VK tree root when the AVM is disabled (the AVM is only enabled on ARM release builds because of build times).
        Fr.fromHexString('0x19e3d93ad6369e960f28fdda0da5110129c2db67f49445d8406001eab1a1ae6a'),
      );
    }

    expect(expectedRoots).toContainEqual(getVKTreeRoot());
  });
  it('has expected Protocol Contracts tree root', () => {
    expect(protocolContractTreeRoot).toEqual(
      Fr.fromHexString('0x20b49b5e2004b516f057509123ae1a4a2120605005351776051867e3caab413e'),
    );
  });
  it('has expected Genesis tree roots', async () => {
    const initialAccounts: InitialAccountData[] = [];
    const sponsoredFPCAddress = await getSponsoredFPCAddress();
    const initialFundedAccounts = initialAccounts.map(a => a.address).concat(sponsoredFPCAddress);
    const { genesisArchiveRoot } = await getGenesisValues(initialFundedAccounts);

    expect(genesisArchiveRoot).toEqual(
      Fr.fromHexString('0x204ce64a69ce23a572afdbb50a156a58b2ee1c37ea92a278f96147f3aec93dfc'),
    );
  });
});
