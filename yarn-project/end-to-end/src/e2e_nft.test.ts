import { AztecAddress, Fr, type Wallet } from '@aztec/aztec.js';
import { NFTContract } from '@aztec/noir-contracts.js/NFT';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// This is a very simple test checking only the happy path. More complete tests of the NFT are implemented with TXE.
// This test is only kept around to check that public data writes are squashed as expected.
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
    ({ teardown, wallet, accounts } = await setup(4));
    [adminAddress, minterAddress, user1Address, user2Address] = accounts;

    nftContract = await NFTContract.deploy(wallet, adminAddress, 'FROG', 'FRG').send({ from: adminAddress }).deployed();
  });

  afterAll(() => teardown());

  // NOTE: This test is sequential and each test case depends on the previous one
  it('sets minter', async () => {
    await nftContract.methods.set_minter(minterAddress, true).send({ from: adminAddress }).wait();
    const isMinterAMinter = await nftContract.methods.is_minter(minterAddress).simulate({ from: minterAddress });
    expect(isMinterAMinter).toBe(true);
  });

  it('minter mints to a user', async () => {
    await nftContract.methods.mint(user1Address, TOKEN_ID).send({ from: minterAddress }).wait();
    const ownerAfterMint = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(ownerAfterMint).toEqual(user1Address);
  });

  it('transfers to private', async () => {
    // In a simple "shield" flow the sender and recipient are the same. In the "AMM swap to private" flow
    // the sender would be the AMM contract.
    const recipient = user2Address;

    await nftContract.methods.transfer_to_private(recipient, TOKEN_ID).send({ from: user1Address }).wait();
    const publicOwnerAfter = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(AztecAddress.ZERO);
  });

  it('transfers in private', async () => {
    await nftContract.methods
      .transfer_in_private(user2Address, user1Address, TOKEN_ID, 0)
      .send({ from: user2Address })
      .wait();

    const user1Nfts = await getPrivateNfts(user1Address);
    expect(user1Nfts).toEqual([TOKEN_ID]);

    const user2Nfts = await getPrivateNfts(user2Address);
    expect(user2Nfts).toEqual([]);
  });

  it('transfers to public', async () => {
    await nftContract.methods
      .transfer_to_public(user1Address, user2Address, TOKEN_ID, 0)
      .send({ from: user1Address })
      .wait();

    const publicOwnerAfter = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(user2Address);
  });

  it('transfers in public', async () => {
    await nftContract.methods
      .transfer_in_public(user2Address, user1Address, TOKEN_ID, 0)
      .send({ from: user2Address })
      .wait();

    const publicOwnerAfter = await nftContract.methods.owner_of(TOKEN_ID).simulate({ from: user2Address });
    expect(publicOwnerAfter).toEqual(user1Address);
  });

  const getPrivateNfts = async (owner: AztecAddress) => {
    const [nfts, pageLimitReached] = await nftContract.methods.get_private_nfts(owner, 0).simulate({ from: owner });
    if (pageLimitReached) {
      throw new Error('Page limit reached and pagination not implemented in test');
    }
    // We prune placeholder values
    return nfts.filter((tokenId: bigint) => tokenId !== 0n);
  };
});
