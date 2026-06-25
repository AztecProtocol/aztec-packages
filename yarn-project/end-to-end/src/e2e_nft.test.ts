import { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { NFTContract } from '@aztec/noir-contracts.js/NFT';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS } from './fixtures/fixtures.js';
import { setup } from './fixtures/utils.js';

const TIMEOUT = 300_000;

// This is a very simple test checking only the happy path. More complete tests of the NFT are implemented with TXE.
// This test is only kept around to check that public data writes are squashed as expected.
// Single automine node, four funded accounts (admin, minter, user1, user2), NFTContract deployed.
// Tests are sequential: each depends on the state left by the previous.
describe('NFT', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let wallet: Wallet;

  let adminAddress: AztecAddress;
  let minterAddress: AztecAddress;
  let user1Address: AztecAddress;
  let user2Address: AztecAddress;

  let nftContract: NFTContract;

  // Arbitrary token id
  const TOKEN_ID = Fr.random().toBigInt();

  beforeAll(async () => {
    let accounts: AztecAddress[];
    ({ teardown, wallet, accounts } = await setup(4, { ...AUTOMINE_E2E_OPTS }));
    [adminAddress, minterAddress, user1Address, user2Address] = accounts;

    ({ contract: nftContract } = await NFTContract.deploy(wallet, adminAddress, 'FROG', 'FRG').send({
      from: adminAddress,
    }));
  });

  afterAll(() => teardown());

  // NOTE: This test is sequential and each test case depends on the previous one
  // Calls set_minter on the NFT contract and verifies is_minter returns true for minterAddress.
  it('sets minter', async () => {
    await nftContract.methods.set_minter(minterAddress, true).send({ from: adminAddress });
    const { result: isMinterAMinter } = await nftContract.methods
      .is_minter(minterAddress)
      .simulate({ from: minterAddress });
    expect(isMinterAMinter).toBe(true);
  });

  // Mints TOKEN_ID to user1 and checks owner_of returns user1Address.
  it('minter mints to a user', async () => {
    await nftContract.methods.mint(user1Address, TOKEN_ID).send({ from: minterAddress });
    const { result: ownerAfterMint } = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(ownerAfterMint).toEqual(user1Address);
  });

  // Transfers TOKEN_ID from public to private (recipient=user2); asserts public owner becomes
  // AztecAddress.ZERO after the shield.
  it('transfers to private', async () => {
    // In a simple "shield" flow the sender and recipient are the same. In the "AMM swap to private" flow
    // the sender would be the AMM contract.
    const recipient = user2Address;

    await nftContract.methods.transfer_to_private(recipient, TOKEN_ID).send({ from: user1Address });
    const { result: publicOwnerAfter } = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(AztecAddress.ZERO);
  });

  // Transfers TOKEN_ID from user2 to user1 in private; verifies user1's private NFT list and
  // user2's list is empty.
  it('transfers in private', async () => {
    await nftContract.methods.transfer_in_private(user2Address, user1Address, TOKEN_ID, 0).send({ from: user2Address });

    const user1Nfts = await getPrivateNfts(user1Address);
    expect(user1Nfts).toEqual([TOKEN_ID]);

    const user2Nfts = await getPrivateNfts(user2Address);
    expect(user2Nfts).toEqual([]);
  });

  // Transfers TOKEN_ID from user1's private balance back to public (recipient=user2); asserts
  // public owner is user2.
  it('transfers to public', async () => {
    await nftContract.methods.transfer_to_public(user1Address, user2Address, TOKEN_ID, 0).send({ from: user1Address });

    const { result: publicOwnerAfter } = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(user2Address);
  });

  // Transfers TOKEN_ID in public from user2 to user1 and asserts the public owner changes.
  it('transfers in public', async () => {
    await nftContract.methods.transfer_in_public(user2Address, user1Address, TOKEN_ID, 0).send({ from: user2Address });

    const { result: publicOwnerAfter } = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user2Address });
    expect(publicOwnerAfter).toEqual(user1Address);
  });

  const getPrivateNfts = async (owner: AztecAddress) => {
    const {
      result: [nfts, pageLimitReached],
    } = await nftContract.methods.get_private_nfts(owner, 0).simulate({ from: owner });
    if (pageLimitReached) {
      throw new Error('Page limit reached and pagination not implemented in test');
    }
    // We prune placeholder values
    return nfts.filter((tokenId: bigint) => tokenId !== 0n);
  };
});
