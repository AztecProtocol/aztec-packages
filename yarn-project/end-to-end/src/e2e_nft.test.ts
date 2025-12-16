import { type AccountWallet, AztecAddress, Fr } from '@aztec/aztec.js';
import { NFTContract } from '@aztec/noir-contracts.js/NFT';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 120_000;

// This is a very simple test checking only the happy path. More complete tests of the NFT are implemented with TXE.
// This test is only kept around to check that public data writes are squashed as expected.
describe('NFT', () => {
  jest.setTimeout(TIMEOUT);

  let teardown: () => Promise<void>;

  let adminWallet: AccountWallet;
  let minterWallet: AccountWallet;
  let user1Wallet: AccountWallet;
  let user2Wallet: AccountWallet;

  let adminAddress: AztecAddress;
  let minterAddress: AztecAddress;
  let user1Address: AztecAddress;
  let user2Address: AztecAddress;

  let nftContractAddress: AztecAddress;

  // Arbitrary token id
  const TOKEN_ID = Fr.random().toBigInt();

  beforeAll(async () => {
    let wallets: AccountWallet[];
    let accounts: AztecAddress[];
    ({ teardown, wallets, accounts } = await setup(4));
    [adminWallet, minterWallet, user1Wallet, user2Wallet] = wallets;
    [adminAddress, minterAddress, user1Address, user2Address] = accounts;

    const nftContract = await NFTContract.deploy(adminWallet, adminAddress, 'FROG', 'FRG')
      .send({ from: adminAddress })
      .deployed();
    nftContractAddress = nftContract.address;
  });

  afterAll(() => teardown());

  // NOTE: This test is sequential and each test case depends on the previous one
  it('sets minter', async () => {
    const nftContractAsAdmin = await NFTContract.at(nftContractAddress, adminWallet);

    await nftContractAsAdmin.methods.set_minter(minterAddress, true).send({ from: adminAddress }).wait();
    const isMinterAMinter = await nftContractAsAdmin.methods.is_minter(minterAddress).simulate({ from: minterAddress });
    expect(isMinterAMinter).toBe(true);
  });

  it('minter mints to a user', async () => {
    const nftContractAsMinter = await NFTContract.at(nftContractAddress, minterWallet);

    const nftMintInteraction = nftContractAsMinter.methods.mint(user1Address, TOKEN_ID);
    await nftMintInteraction.send({ from: minterAddress }).wait();

    const ownerAfterMint = await nftContractAsMinter.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(ownerAfterMint).toEqual(user1Address);
  });

  it('transfers to private', async () => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);

    // In a simple "shield" flow the sender and recipient are the same. In the "AMM swap to private" flow
    // the sender would be the AMM contract.
    const recipient = user2Address;

    await nftContractAsUser1.methods.transfer_to_private(recipient, TOKEN_ID).send({ from: user1Address }).wait();

    const publicOwnerAfter = await nftContractAsUser1.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(AztecAddress.ZERO);
  });

  it('transfers in private', async () => {
    const nftContractAsUser2 = await NFTContract.at(nftContractAddress, user2Wallet);

    const nftTransferInteraction = nftContractAsUser2.methods.transfer_in_private(
      user2Address,
      user1Address,
      TOKEN_ID,
      0,
    );
    await nftTransferInteraction.send({ from: user2Address }).wait();

    const user1Nfts = await getPrivateNfts(user1Address);
    expect(user1Nfts).toEqual([TOKEN_ID]);

    const user2Nfts = await getPrivateNfts(user2Address);
    expect(user2Nfts).toEqual([]);
  });

  it('transfers to public', async () => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);

    await nftContractAsUser1.methods
      .transfer_to_public(user1Address, user2Address, TOKEN_ID, 0)
      .send({ from: user1Address })
      .wait();

    const publicOwnerAfter = await nftContractAsUser1.methods.owner_of(TOKEN_ID).simulate({ from: user1Address });
    expect(publicOwnerAfter).toEqual(user2Address);
  });

  it('transfers in public', async () => {
    const nftContractAsUser2 = await NFTContract.at(nftContractAddress, user2Wallet);

    await nftContractAsUser2.methods
      .transfer_in_public(user2Address, user1Address, TOKEN_ID, 0)
      .send({ from: user2Address })
      .wait();

    const publicOwnerAfter = await nftContractAsUser2.methods.owner_of(TOKEN_ID).simulate({ from: user2Address });
    expect(publicOwnerAfter).toEqual(user1Address);
  });

  const getPrivateNfts = async (owner: AztecAddress) => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);
    const [nfts, pageLimitReached] = await nftContractAsUser1.methods
      .get_private_nfts(owner, 0)
      .simulate({ from: user1Address });
    if (pageLimitReached) {
      throw new Error('Page limit reached and pagination not implemented in test');
    }
    // We prune placeholder values
    return nfts.filter((tokenId: bigint) => tokenId !== 0n);
  };
});
