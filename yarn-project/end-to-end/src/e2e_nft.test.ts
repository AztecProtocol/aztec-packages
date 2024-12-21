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

  let nftContractAddress: AztecAddress;

  // Arbitrary token id
  const TOKEN_ID = Fr.random().toBigInt();

  beforeAll(async () => {
    let wallets: AccountWallet[];
    ({ teardown, wallets } = await setup(4));
    [adminWallet, minterWallet, user1Wallet, user2Wallet] = wallets;

    const nftContract = await NFTContract.deploy(adminWallet, adminWallet.getAddress(), 'FROG', 'FRG')
      .send()
      .deployed();
    nftContractAddress = nftContract.address;
  });

  afterAll(() => teardown());

  // NOTE: This test is sequential and each test case depends on the previous one
  it('sets minter', async () => {
    const nftContractAsAdmin = await NFTContract.at(nftContractAddress, adminWallet);

    await nftContractAsAdmin.methods.set_minter(minterWallet.getAddress(), true).send().wait();
    const isMinterAMinter = await nftContractAsAdmin.methods.is_minter(minterWallet.getAddress()).simulate();
    expect(isMinterAMinter).toBe(true);
  });

  it('minter mints to a user', async () => {
    const nftContractAsMinter = await NFTContract.at(nftContractAddress, minterWallet);

    await nftContractAsMinter.methods.mint(user1Wallet.getAddress(), TOKEN_ID).send().wait();

    const ownerAfterMint = await nftContractAsMinter.methods.owner_of(TOKEN_ID).simulate();
    expect(ownerAfterMint).toEqual(user1Wallet.getAddress());
  });

  it('transfers to private', async () => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);

    // In a simple "shield" flow the sender and recipient are the same. In the "AMM swap to private" flow
    // the sender would be the AMM contract.
    const recipient = user2Wallet.getAddress();

    await nftContractAsUser1.methods.transfer_to_private(recipient, TOKEN_ID).send().wait();

    const publicOwnerAfter = await nftContractAsUser1.methods.owner_of(TOKEN_ID).simulate();
    expect(publicOwnerAfter).toEqual(AztecAddress.ZERO);

    // We should get 20 data writes setting values to 0 - 3 for note hiding point, 16 for partial log and 1 for public
    // owner (we transfer to private so public owner is set to 0). Ideally we would have here only 1 data write as the
    // 4 values change from zero to non-zero to zero in the tx and hence no write could be committed. This makes public
    // writes squashing too expensive for transient storage. This however probably does not matter as I assume we will
    // want to implement a real transient storage anyway. (Informed Leila about the potential optimization.)
    // TODO(#9376): Re-enable the following check.
    // const publicDataWritesValues = debugInfo!.publicDataWrites!.map(write => write.newValue.toBigInt());
    // expect(publicDataWritesValues).toEqual([
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    //   0n,
    // ]);
  });

  it('transfers in private', async () => {
    const nftContractAsUser2 = await NFTContract.at(nftContractAddress, user2Wallet);

    await nftContractAsUser2.methods
      .transfer_in_private(user2Wallet.getAddress(), user1Wallet.getAddress(), TOKEN_ID, 0)
      .send()
      .wait();

    const user1Nfts = await getPrivateNfts(user1Wallet.getAddress());
    expect(user1Nfts).toEqual([TOKEN_ID]);

    const user2Nfts = await getPrivateNfts(user2Wallet.getAddress());
    expect(user2Nfts).toEqual([]);
  });

  it('transfers to public', async () => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);

    await nftContractAsUser1.methods
      .transfer_to_public(user1Wallet.getAddress(), user2Wallet.getAddress(), TOKEN_ID, 0)
      .send()
      .wait();

    const publicOwnerAfter = await nftContractAsUser1.methods.owner_of(TOKEN_ID).simulate();
    expect(publicOwnerAfter).toEqual(user2Wallet.getAddress());
  });

  it('transfers in public', async () => {
    const nftContractAsUser2 = await NFTContract.at(nftContractAddress, user2Wallet);

    await nftContractAsUser2.methods
      .transfer_in_public(user2Wallet.getAddress(), user1Wallet.getAddress(), TOKEN_ID, 0)
      .send()
      .wait();

    const publicOwnerAfter = await nftContractAsUser2.methods.owner_of(TOKEN_ID).simulate();
    expect(publicOwnerAfter).toEqual(user1Wallet.getAddress());
  });

  const getPrivateNfts = async (owner: AztecAddress) => {
    const nftContractAsUser1 = await NFTContract.at(nftContractAddress, user1Wallet);
    const [nfts, pageLimitReached] = await nftContractAsUser1.methods.get_private_nfts(owner, 0).simulate();
    if (pageLimitReached) {
      throw new Error('Page limit reached and pagination not implemented in test');
    }
    // We prune placeholder values
    return nfts.filter((tokenId: bigint) => tokenId !== 0n);
  };
});
