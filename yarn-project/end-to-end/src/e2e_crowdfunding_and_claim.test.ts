import { Fr, type Logger, PublicKeys, deriveKeys } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';
import { CrowdfundingContract } from '@aztec/noir-contracts.js/Crowdfunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';

import { mintTokensToPrivate } from './fixtures/token_utils.js';
import { setup } from './fixtures/utils.js';

jest.setTimeout(200_000);

// Tests crowdfunding via the Crowdfunding contract and claiming the reward token via the Claim contract
describe('e2e_crowdfunding_and_claim', () => {
  const donationTokenMetadata = {
    name: 'Donation Token',
    symbol: 'DNT',
    decimals: 18n,
  };

  const rewardTokenMetadata = {
    name: 'Reward Token',
    symbol: 'RWT',
    decimals: 18n,
  };

  let teardown: () => Promise<void>;

  let wallet: TestWallet;
  let operatorAddress: AztecAddress;
  let donor1Address: AztecAddress;
  let donor2Address: AztecAddress;

  let logger: Logger;

  let donationToken: TokenContract;
  let rewardToken: TokenContract;
  let crowdfundingContract: CrowdfundingContract;
  let claimContract: ClaimContract;

  let crowdfundingSecretKey;
  let crowdfundingPublicKeys: PublicKeys;
  let cheatCodes: CheatCodes;
  let deadline: number; // end of crowdfunding period

  let uintNote!: any;

  beforeAll(async () => {
    ({
      cheatCodes,
      teardown,
      logger,
      wallet,
      accounts: [operatorAddress, donor1Address, donor2Address],
    } = await setup(3));

    // We set the deadline to a week from now
    deadline = (await cheatCodes.eth.timestamp()) + 7 * 24 * 60 * 60;

    donationToken = await TokenContract.deploy(
      wallet,
      operatorAddress,
      donationTokenMetadata.name,
      donationTokenMetadata.symbol,
      donationTokenMetadata.decimals,
    )
      .send({ from: operatorAddress })
      .deployed();
    logger.info(`Donation Token deployed to ${donationToken.address}`);

    rewardToken = await TokenContract.deploy(
      wallet,
      operatorAddress,
      rewardTokenMetadata.name,
      rewardTokenMetadata.symbol,
      rewardTokenMetadata.decimals,
    )
      .send({ from: operatorAddress })
      .deployed();
    logger.info(`Reward Token deployed to ${rewardToken.address}`);

    // We deploy the Crowdfunding contract as an escrow contract (i.e. with populated public keys that make it
    // a potential recipient of notes) because the donations accumulate "in it".
    crowdfundingSecretKey = Fr.random();
    crowdfundingPublicKeys = (await deriveKeys(crowdfundingSecretKey)).publicKeys;

    const crowdfundingDeployment = CrowdfundingContract.deployWithPublicKeys(
      crowdfundingPublicKeys,
      wallet,
      donationToken.address,
      operatorAddress,
      deadline,
    );
    const crowdfundingInstance = await crowdfundingDeployment.getInstance();
    await wallet.registerContract(crowdfundingInstance, CrowdfundingContract.artifact, crowdfundingSecretKey);
    crowdfundingContract = await crowdfundingDeployment.send({ from: operatorAddress }).deployed();
    logger.info(`Crowdfunding contract deployed at ${crowdfundingContract.address}`);

    claimContract = await ClaimContract.deploy(wallet, crowdfundingContract.address, rewardToken.address)
      .send({ from: operatorAddress })
      .deployed();
    logger.info(`Claim contract deployed at ${claimContract.address}`);

    await rewardToken.methods.set_minter(claimContract.address, true).send({ from: operatorAddress }).wait();

    // Now we mint DNT to donors
    await mintTokensToPrivate(donationToken, operatorAddress, donor1Address, 1234n);
    await mintTokensToPrivate(donationToken, operatorAddress, donor2Address, 2345n);
  });

  afterAll(async () => {
    await teardown();
  });

  it('full donor flow', async () => {
    const donationAmount = 1000n;

    // 1) We create an authwit so that the Crowdfunding contract can transfer donor's DNT and donate
    {
      const action = donationToken.methods.transfer_in_private(
        donor1Address,
        crowdfundingContract.address,
        donationAmount,
        0,
      );
      const witness = await wallet.createAuthWit(donor1Address, { caller: crowdfundingContract.address, action });
      await crowdfundingContract.methods
        .donate(donationAmount)
        .send({ from: donor1Address, authWitnesses: [witness] })
        .wait();

      // The donor should have exactly one note
      const pageIndex = 0;
      const notes = await crowdfundingContract.methods
        .get_donation_notes(donor1Address, pageIndex)
        .simulate({ from: donor1Address });
      expect(notes.len).toEqual(1n);
      uintNote = notes.storage[0];
    }

    // 2) We claim the reward token via the Claim contract
    {
      await claimContract.methods.claim(uintNote, donor1Address).send({ from: donor1Address }).wait();
    }

    // Since the RWT is minted 1:1 with the DNT, the balance of the reward token should be equal to the donation amount
    const balanceRWT = await rewardToken.methods.balance_of_public(donor1Address).simulate({ from: operatorAddress });
    expect(balanceRWT).toEqual(donationAmount);

    const balanceDNTBeforeWithdrawal = await donationToken.methods
      .balance_of_private(operatorAddress)
      .simulate({ from: operatorAddress });
    expect(balanceDNTBeforeWithdrawal).toEqual(0n);

    // 3) At last, we withdraw the raised funds from the crowdfunding contract to the operator's address
    await crowdfundingContract.methods.withdraw(donationAmount).send({ from: operatorAddress }).wait();

    const balanceDNTAfterWithdrawal = await donationToken.methods
      .balance_of_private(operatorAddress)
      .simulate({ from: operatorAddress });

    // Operator should have all the DNT now
    expect(balanceDNTAfterWithdrawal).toEqual(donationAmount);
  });

  it('cannot claim twice', async () => {
    // The first claim was executed in the previous test
    await expect(
      claimContract.methods.claim(uintNote, donor1Address).send({ from: donor1Address }).wait(),
    ).rejects.toThrow();
  });

  it('cannot claim with a different address than the one that donated', async () => {
    const donationAmount = 1000n;

    const donorAddress = donor2Address;
    const unrelatedAddress = donor1Address;

    // 1) We permit the crowdfunding contract to pull the donation amount from the donor's wallet, and we donate
    const action = donationToken.methods.transfer_in_private(
      donorAddress,
      crowdfundingContract.address,
      donationAmount,
      0,
    );
    const witness = await wallet.createAuthWit(donorAddress, { caller: crowdfundingContract.address, action });
    await crowdfundingContract.methods
      .donate(donationAmount)
      .send({ from: donorAddress, authWitnesses: [witness] })
      .wait();

    // The donor should have exactly one note
    const pageIndex = 0;
    const notes = await crowdfundingContract.methods
      .get_donation_notes(donorAddress, pageIndex)
      .simulate({ from: donorAddress });
    expect(notes.len).toEqual(1n);
    const anotherDonationNote = notes.storage[0];

    // 2) We try to claim the reward token via the Claim contract with the unrelated wallet
    // docs:start:local-tx-fails
    await expect(
      claimContract.methods.claim(anotherDonationNote, donorAddress).send({ from: unrelatedAddress }).wait(),
    ).rejects.toThrow('Note does not belong to the sender');
    // docs:end:local-tx-fails
  });

  it('cannot claim with a non-existent note', async () => {
    // We get a non-existent note by copy the UintNote and change the randomness to a random value
    const nonExistentNote = { ...uintNote };
    nonExistentNote.randomness = Fr.random();

    await expect(
      claimContract.methods.claim(nonExistentNote, donor1Address).send({ from: donor1Address }).wait(),
    ).rejects.toThrow();
  });

  it('cannot claim with existing note which was not emitted by a different contract', async () => {
    // 1) Deploy another instance of the crowdfunding contract
    let otherCrowdfundingContract: CrowdfundingContract;
    {
      const otherCrowdfundingDeployment = CrowdfundingContract.deployWithPublicKeys(
        crowdfundingPublicKeys,
        wallet,
        donationToken.address,
        operatorAddress,
        deadline,
      );

      otherCrowdfundingContract = await otherCrowdfundingDeployment.send({ from: operatorAddress }).deployed();
      logger.info(`Crowdfunding contract deployed at ${otherCrowdfundingContract.address}`);
    }

    // 2) Make a donation to get a note from the other contract
    await mintTokensToPrivate(donationToken, operatorAddress, donor1Address, 1000n);
    const donationAmount = 1000n;
    const action = donationToken.methods.transfer_in_private(
      donor1Address,
      otherCrowdfundingContract.address,
      donationAmount,
      0,
    );
    const witness = await wallet.createAuthWit(donor1Address, { caller: otherCrowdfundingContract.address, action });
    await otherCrowdfundingContract.methods
      .donate(donationAmount)
      .send({ from: donor1Address, authWitnesses: [witness] })
      .wait();

    // 3) Get the donation note
    const pageIndex = 0;
    const notes = await otherCrowdfundingContract.methods
      .get_donation_notes(donor1Address, pageIndex)
      .simulate({ from: donor1Address });
    expect(notes.len).toEqual(1n);
    const otherContractNote = notes.storage[0];

    // 4) Try to claim rewards using note from other contract
    await expect(
      claimContract.methods.claim(otherContractNote, donor1Address).send({ from: donor1Address }).wait(),
    ).rejects.toThrow();
  });

  it('cannot withdraw as a non-operator', async () => {
    const donationAmount = 500n;

    // 1) We add authwit so that the Crowdfunding contract can transfer donor's DNT
    const action = donationToken.methods.transfer_in_private(
      donor2Address,
      crowdfundingContract.address,
      donationAmount,
      0,
    );
    const witness = await wallet.createAuthWit(donor2Address, { caller: crowdfundingContract.address, action });

    // 2) We donate to the crowdfunding contract
    await crowdfundingContract.methods
      .donate(donationAmount)
      .send({ from: donor2Address, authWitnesses: [witness] })
      .wait();

    // The following should fail as msg_sender != operator
    await expect(
      crowdfundingContract.methods.withdraw(donationAmount).send({ from: donor2Address }).wait(),
    ).rejects.toThrow('Assertion failed: Not an operator');
  });

  it('cannot donate after a deadline', async () => {
    const donationAmount = 1000n;

    // 1) We add authwit so that the Crowdfunding contract can transfer donor's DNT

    const action = donationToken.methods.transfer_in_private(
      donor2Address,
      crowdfundingContract.address,
      donationAmount,
      0,
    );
    const witness = await wallet.createAuthWit(donor2Address, { caller: crowdfundingContract.address, action });

    // 2) We set next block timestamp to be after the deadline
    await cheatCodes.eth.warp(deadline + 1);

    // 3) We donate to the crowdfunding contract
    await expect(
      crowdfundingContract.methods
        .donate(donationAmount)
        .send({ from: donor2Address, authWitnesses: [witness] })
        .wait(),
    ).rejects.toThrow();
  });
});
