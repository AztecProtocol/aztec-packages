import { Fr } from '@aztec/aztec.js/fields';
import { PublicKeys, deriveKeys } from '@aztec/aztec.js/keys';
import type { Logger } from '@aztec/aztec.js/log';
import { CheatCodes } from '@aztec/aztec/testing';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';
import { CrowdfundingContract } from '@aztec/noir-contracts.js/Crowdfunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';

import { mintTokensToPrivate } from '../../fixtures/token_utils.js';
import { ensurePublicChecksPublished } from '../../fixtures/utils.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { AutomineTestContext } from '../automine_test_context.js';

jest.setTimeout(400_000);

// Tests crowdfunding via the Crowdfunding contract and claiming the reward token via the Claim contract.
// Uses setup(3, AUTOMINE_E2E_OPTS) with one node, automine sequencer, three accounts (operator, 2 donors).
// One test warps L1 time via cheatCodes.eth.warp to pass the deadline. jest.setTimeout(400s).
describe('automine/token/crowdfunding_and_claim', () => {
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

  let crowdfundingSecretKey: Fr;
  let crowdfundingPublicKeys: PublicKeys;
  let cheatCodes: CheatCodes;
  let _aztecNode: AztecNode & AztecNodeDebug;
  let deadline: number; // end of crowdfunding period

  let uintNote!: any;

  beforeAll(async () => {
    ({
      cheatCodes,
      teardown,
      logger,
      wallet,
      aztecNode: _aztecNode,
      accounts: [operatorAddress, donor1Address, donor2Address],
    } = (await AutomineTestContext.setup({ numberOfAccounts: 3 })).context);

    // Crowdfunding's `donate` calls `privately_check_timestamp`, which dispatches into the deployed
    // PublicChecks contract. Publish PublicChecks before the test runs anything that uses it.
    await ensurePublicChecksPublished(wallet, operatorAddress);

    // We set the deadline to a week from now
    deadline = (await cheatCodes.eth.lastBlockTimestamp()) + 7 * 24 * 60 * 60;

    ({ contract: donationToken } = await TokenContract.deploy(
      wallet,
      operatorAddress,
      donationTokenMetadata.name,
      donationTokenMetadata.symbol,
      donationTokenMetadata.decimals,
    ).send({ from: operatorAddress }));
    logger.info(`Donation Token deployed to ${donationToken.address}`);

    ({ contract: rewardToken } = await TokenContract.deploy(
      wallet,
      operatorAddress,
      rewardTokenMetadata.name,
      rewardTokenMetadata.symbol,
      rewardTokenMetadata.decimals,
    ).send({ from: operatorAddress }));
    logger.info(`Reward Token deployed to ${rewardToken.address}`);

    // We deploy the Crowdfunding contract as an escrow contract (i.e. with populated public keys that make it
    // a potential recipient of notes) because the donations accumulate "in it".
    crowdfundingSecretKey = Fr.random();
    crowdfundingPublicKeys = (await deriveKeys(crowdfundingSecretKey)).publicKeys;

    const crowdfundingDeployment = CrowdfundingContract.deploy(
      wallet,
      donationToken.address,
      operatorAddress,
      deadline,
      { publicKeys: crowdfundingPublicKeys, deployer: operatorAddress },
    );
    const crowdfundingInstance = await crowdfundingDeployment.getInstance();
    await wallet.registerContract(crowdfundingInstance, CrowdfundingContract.artifact, crowdfundingSecretKey);
    ({ contract: crowdfundingContract } = await crowdfundingDeployment.send({
      from: operatorAddress,
      // The contract constructor initializes private storage vars that need the contract's own nullifier key.
      additionalScopes: [crowdfundingInstance.address],
    }));
    logger.info(`Crowdfunding contract deployed at ${crowdfundingContract.address}`);

    ({ contract: claimContract } = await ClaimContract.deploy(
      wallet,
      crowdfundingContract.address,
      rewardToken.address,
    ).send({
      from: operatorAddress,
    }));
    logger.info(`Claim contract deployed at ${claimContract.address}`);

    await rewardToken.methods.set_minter(claimContract.address, true).send({ from: operatorAddress });

    // Now we mint DNT to donors
    await mintTokensToPrivate(donationToken, operatorAddress, donor1Address, 1234n);
    await mintTokensToPrivate(donationToken, operatorAddress, donor2Address, 2345n);
  });

  afterAll(async () => {
    await teardown();
  });

  // Happy path: donor1 donates via authwit, claims reward token via Claim contract, operator
  // withdraws. Asserts DNT and RWT balances match expected values throughout.
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
      await crowdfundingContract.methods.donate(donationAmount).send({ from: donor1Address, authWitnesses: [witness] });

      // The donor should have exactly one note
      const pageIndex = 0;
      const { result: notes } = await crowdfundingContract.methods
        .get_donation_notes(donor1Address, pageIndex)
        .simulate({ from: donor1Address });
      expect(notes.len).toEqual(1n);
      uintNote = notes.storage[0];
    }

    // 2) We claim the reward token via the Claim contract
    {
      await claimContract.methods.claim(uintNote, donor1Address).send({ from: donor1Address });
    }

    // Since the RWT is minted 1:1 with the DNT, the balance of the reward token should be equal to the donation amount
    const { result: balanceRWT } = await rewardToken.methods
      .balance_of_public(donor1Address)
      .simulate({ from: operatorAddress });
    expect(balanceRWT).toEqual(donationAmount);

    const { result: balanceDNTBeforeWithdrawal } = await donationToken.methods
      .balance_of_private(operatorAddress)
      .simulate({ from: operatorAddress });
    expect(balanceDNTBeforeWithdrawal).toEqual(0n);

    // 3) At last, we withdraw the raised funds from the crowdfunding contract to the operator's address
    await crowdfundingContract.methods
      .withdraw(donationAmount)
      // Withdraw nullifies the contract's own token notes, which requires its nullifier key.
      .send({ from: operatorAddress, additionalScopes: [crowdfundingContract.address] });

    const { result: balanceDNTAfterWithdrawal } = await donationToken.methods
      .balance_of_private(operatorAddress)
      .simulate({ from: operatorAddress });

    // Operator should have all the DNT now
    expect(balanceDNTAfterWithdrawal).toEqual(donationAmount);
  });

  // Attempts to claim the same UintNote that was consumed in the previous test; expects a revert.
  it('cannot claim twice', async () => {
    // The first claim was executed in the previous test
    await expect(claimContract.methods.claim(uintNote, donor1Address).send({ from: donor1Address })).rejects.toThrow();
  });

  // donor2 donates, then donor1 tries to claim donor2's note; expects an owner check failure.
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
    await crowdfundingContract.methods.donate(donationAmount).send({ from: donorAddress, authWitnesses: [witness] });

    // The donor should have exactly one note
    const pageIndex = 0;
    const { result: notes } = await crowdfundingContract.methods
      .get_donation_notes(donorAddress, pageIndex)
      .simulate({ from: donorAddress });
    expect(notes.len).toEqual(1n);
    const anotherDonationNote = notes.storage[0];

    // 2) We try to claim the reward token via the Claim contract with the unrelated wallet - the owner check
    // should fail because the msg_sender is not the note owner.
    // docs:start:local-tx-fails
    await expect(
      claimContract.methods.claim(anotherDonationNote, donorAddress).send({ from: unrelatedAddress }),
    ).rejects.toThrow('confirmed_note.owner == self.msg_sender()');
    // docs:end:local-tx-fails
  });

  // Modifies an existing note's randomness to make it non-existent, then tries to claim; expects revert.
  it('cannot claim with a non-existent note', async () => {
    // We get a non-existent note by copy the UintNote and change the randomness to a random value
    const nonExistentNote = { ...uintNote };
    nonExistentNote.randomness = Fr.random();

    await expect(
      claimContract.methods.claim(nonExistentNote, donor1Address).send({ from: donor1Address }),
    ).rejects.toThrow();
  });

  // Deploys a second Crowdfunding instance, donor1 donates to it, then attempts to claim that note
  // via the original Claim contract (which only accepts notes from the original Crowdfunding). Expects revert.
  it('cannot claim with existing note which was not emitted by a different contract', async () => {
    // 1) Deploy another instance of the crowdfunding contract
    let otherCrowdfundingContract: CrowdfundingContract;
    {
      const otherCrowdfundingSecretKey = Fr.random();
      const otherCrowdfundingPublicKeys = (await deriveKeys(otherCrowdfundingSecretKey)).publicKeys;
      const otherCrowdfundingDeployment = CrowdfundingContract.deploy(
        wallet,
        donationToken.address,
        operatorAddress,
        deadline,
        { publicKeys: otherCrowdfundingPublicKeys, deployer: operatorAddress },
      );

      const otherCrowdfundingInstance = await otherCrowdfundingDeployment.getInstance();
      await wallet.registerContract(
        otherCrowdfundingInstance,
        CrowdfundingContract.artifact,
        otherCrowdfundingSecretKey,
      );
      ({ contract: otherCrowdfundingContract } = await otherCrowdfundingDeployment.send({
        from: operatorAddress,
        // The contract constructor initializes private storage vars that need the contract's own nullifier key.
        additionalScopes: [otherCrowdfundingInstance.address],
      }));
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
      .send({ from: donor1Address, authWitnesses: [witness] });

    // 3) Get the donation note
    const pageIndex = 0;
    const { result: notes2 } = await otherCrowdfundingContract.methods
      .get_donation_notes(donor1Address, pageIndex)
      .simulate({ from: donor1Address });
    expect(notes2.len).toEqual(1n);
    const otherContractNote = notes2.storage[0];

    // 4) Try to claim rewards using note from other contract
    await expect(
      claimContract.methods.claim(otherContractNote, donor1Address).send({ from: donor1Address }),
    ).rejects.toThrow();
  });

  // donor2 donates, then tries to withdraw from the operator's position; expects "Not an operator" revert.
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
    await crowdfundingContract.methods.donate(donationAmount).send({ from: donor2Address, authWitnesses: [witness] });

    // The following should fail as msg_sender != operator
    await expect(
      crowdfundingContract.methods
        .withdraw(donationAmount)
        // Withdraw nullifies the contract's own token notes, which requires its nullifier key.
        .send({ from: donor2Address, additionalScopes: [crowdfundingContract.address] }),
    ).rejects.toThrow('Assertion failed: Not an operator');
  });

  // Warps L1 time past the deadline via cheatCodes.eth.warp, then attempts to donate; expects revert.
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

    // 2) We warp L1 past the deadline. We don't mine an L2 block here: the deadline is set 7
    // days in the future during setup, and warping that far before mining would cause the
    // archiver to predict-reorg every prior checkpoint (their L1 publish blocks fall in a stale
    // anvil layout after the warp). The next donate tx is rejected by the contract because the
    // next L2 block's timestamp is already past the deadline.
    await cheatCodes.eth.warp(Number(deadline + 1), { resetBlockInterval: true });

    // 3) We donate to the crowdfunding contract
    await expect(
      crowdfundingContract.methods.donate(donationAmount).send({ from: donor2Address, authWitnesses: [witness] }),
    ).rejects.toThrow();
  });
});
