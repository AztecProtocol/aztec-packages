import { type AccountWallet, Fr, type Logger, type PXE, type UniqueNote, deriveKeys } from '@aztec/aztec.js';
import { CheatCodes } from '@aztec/aztec/testing';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';
import { CrowdfundingContract } from '@aztec/noir-contracts.js/Crowdfunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { computePartialAddress } from '@aztec/stdlib/contract';

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

  let operatorWallet: AccountWallet;
  let donorWallets: AccountWallet[];
  let wallets: AccountWallet[];
  let logger: Logger;

  let donationToken: TokenContract;
  let rewardToken: TokenContract;
  let crowdfundingContract: CrowdfundingContract;
  let claimContract: ClaimContract;

  let crowdfundingSecretKey;
  let crowdfundingPublicKeys;
  let pxe: PXE;
  let cheatCodes: CheatCodes;
  let deadline: number; // end of crowdfunding period

  let uintNote!: any;

  beforeAll(async () => {
    ({ cheatCodes, teardown, logger, pxe, wallets } = await setup(3));
    operatorWallet = wallets[0];
    donorWallets = wallets.slice(1);

    // We set the deadline to a week from now
    deadline = (await cheatCodes.eth.timestamp()) + 7 * 24 * 60 * 60;

    donationToken = await TokenContract.deploy(
      operatorWallet,
      operatorWallet.getAddress(),
      donationTokenMetadata.name,
      donationTokenMetadata.symbol,
      donationTokenMetadata.decimals,
    )
      .send()
      .deployed();
    logger.info(`Donation Token deployed to ${donationToken.address}`);

    rewardToken = await TokenContract.deploy(
      operatorWallet,
      operatorWallet.getAddress(),
      rewardTokenMetadata.name,
      rewardTokenMetadata.symbol,
      rewardTokenMetadata.decimals,
    )
      .send()
      .deployed();
    logger.info(`Reward Token deployed to ${rewardToken.address}`);

    crowdfundingSecretKey = Fr.random();
    crowdfundingPublicKeys = (await deriveKeys(crowdfundingSecretKey)).publicKeys;

    const crowdfundingDeployment = CrowdfundingContract.deployWithPublicKeys(
      crowdfundingPublicKeys,
      operatorWallet,
      donationToken.address,
      operatorWallet.getAddress(),
      deadline,
    );
    const crowdfundingInstance = await crowdfundingDeployment.getInstance();
    await pxe.registerAccount(crowdfundingSecretKey, await computePartialAddress(crowdfundingInstance));
    crowdfundingContract = await crowdfundingDeployment.send().deployed();
    logger.info(`Crowdfunding contract deployed at ${crowdfundingContract.address}`);

    claimContract = await ClaimContract.deploy(operatorWallet, crowdfundingContract.address, rewardToken.address)
      .send()
      .deployed();
    logger.info(`Claim contract deployed at ${claimContract.address}`);

    await rewardToken.methods.set_minter(claimContract.address, true).send().wait();

    // Add the operator address
    // as a contact to all donor wallets, so they can receive notes
    await Promise.all(
      donorWallets.map(async wallet => {
        await wallet.registerSender(operatorWallet.getAddress());
      }),
    );
    // Now we mint DNT to donors
    await mintTokensToPrivate(donationToken, operatorWallet, donorWallets[0].getAddress(), 1234n);
    await mintTokensToPrivate(donationToken, operatorWallet, donorWallets[1].getAddress(), 2345n);
  });

  afterAll(async () => {
    await teardown();
  });

  // Processes unique note such that it can be passed to a claim function of Claim contract
  const processUniqueNote = (uniqueNote: UniqueNote) => {
    return {
      note: {
        owner: AztecAddress.fromField(uniqueNote.note.items[0]),
        randomness: uniqueNote.note.items[1],
        value: uniqueNote.note.items[2].toBigInt(), // We convert to bigint as Fr is not serializable to U128
      },
      // eslint-disable-next-line camelcase
      contract_address: uniqueNote.contractAddress,
      metadata: {
        stage: 3, // aztec::note::note_metadata::NoteStage::SETTLED
        // eslint-disable-next-line camelcase
        maybe_note_nonce: uniqueNote.noteNonce,
      },
    };
  };

  it('full donor flow', async () => {
    const donationAmount = 1000n;

    // 1) We create an authwit so that the Crowdfunding contract can transfer donor's DNT and donate
    {
      const action = donationToken
        .withWallet(donorWallets[0])
        .methods.transfer_in_private(donorWallets[0].getAddress(), crowdfundingContract.address, donationAmount, 0);
      const witness = await donorWallets[0].createAuthWit({ caller: crowdfundingContract.address, action });
      const donateTxReceipt = await crowdfundingContract
        .withWallet(donorWallets[0])
        .methods.donate(donationAmount)
        .send({ authWitnesses: [witness] })
        .wait();

      // Get the notes emitted by the Crowdfunding contract and check that only 1 was emitted (the UintNote)
      const notes = await pxe.getNotes({
        txHash: donateTxReceipt.txHash,
        contractAddress: crowdfundingContract.address,
      });
      const filteredNotes = notes.filter(x => x.contractAddress.equals(crowdfundingContract.address));
      expect(filteredNotes!.length).toEqual(1);

      // Set the UintNote in a format which can be passed to claim function
      uintNote = processUniqueNote(filteredNotes![0]);
    }

    // 2) We claim the reward token via the Claim contract
    {
      await claimContract
        .withWallet(donorWallets[0])
        .methods.claim(uintNote, donorWallets[0].getAddress())
        .send()
        .wait();
    }

    // Since the RWT is minted 1:1 with the DNT, the balance of the reward token should be equal to the donation amount
    const balanceRWT = await rewardToken.methods.balance_of_public(donorWallets[0].getAddress()).simulate();
    expect(balanceRWT).toEqual(donationAmount);

    const balanceDNTBeforeWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .simulate();
    expect(balanceDNTBeforeWithdrawal).toEqual(0n);

    // 3) At last, we withdraw the raised funds from the crowdfunding contract to the operator's address
    await crowdfundingContract.methods.withdraw(donationAmount).send().wait();

    const balanceDNTAfterWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .simulate();

    // Operator should have all the DNT now
    expect(balanceDNTAfterWithdrawal).toEqual(donationAmount);
  });

  it('cannot claim twice', async () => {
    // The first claim was executed in the previous test
    await expect(
      claimContract.withWallet(donorWallets[0]).methods.claim(uintNote, donorWallets[0].getAddress()).send().wait(),
    ).rejects.toThrow();
  });

  it('cannot claim with a different address than the one that donated', async () => {
    const donationAmount = 1000n;

    const donorWallet = donorWallets[1];
    const unrelatedWallet = donorWallets[0];

    // 1) We permit the crowdfunding contract to pull the donation amount from the donor's wallet, and we donate

    const action = donationToken
      .withWallet(donorWallet)
      .methods.transfer_in_private(donorWallet.getAddress(), crowdfundingContract.address, donationAmount, 0);
    const witness = await donorWallet.createAuthWit({ caller: crowdfundingContract.address, action });
    const donateTxReceipt = await crowdfundingContract
      .withWallet(donorWallet)
      .methods.donate(donationAmount)
      .send({ authWitnesses: [witness] })
      .wait();

    // Get the notes emitted by the Crowdfunding contract and check that only 1 was emitted (the UintNote)
    const notes = await pxe.getNotes({ contractAddress: crowdfundingContract.address, txHash: donateTxReceipt.txHash });
    const filtered = notes.filter(x => x.contractAddress.equals(crowdfundingContract.address));
    expect(filtered!.length).toEqual(1);

    // Set the UintNote in a format which can be passed to claim function
    const anotherDonationNote = processUniqueNote(filtered![0]);

    // 2) We try to claim the reward token via the Claim contract with the unrelated wallet
    await expect(
      claimContract
        .withWallet(unrelatedWallet)
        .methods.claim(anotherDonationNote, donorWallet.getAddress())
        .send()
        .wait(),
    ).rejects.toThrow('Note does not belong to the sender');
  });

  it('cannot claim with a non-existent note', async () => {
    // We get a non-existent note by copy the UintNote and change the randomness to a random value
    const nonExistentNote = { ...uintNote };
    nonExistentNote.randomness = Fr.random();

    await expect(
      claimContract
        .withWallet(donorWallets[0])
        .methods.claim(nonExistentNote, donorWallets[0].getAddress())
        .send()
        .wait(),
    ).rejects.toThrow();
  });

  it('cannot claim with existing note which was not emitted by the crowdfunding contract', async () => {
    const owner = wallets[0].getAddress();

    // 1) Deploy a Test contract
    const testContract = await TestContract.deploy(wallets[0]).send().deployed();

    // 2) Create a note
    let note: any;
    const arbitraryStorageSlot = 69;
    {
      const [arbitraryValue, sender] = [5n, owner];
      const receipt = await testContract.methods
        .call_create_note(arbitraryValue, owner, sender, arbitraryStorageSlot)
        .send()
        .wait();
      const notes = await pxe.getNotes({ txHash: receipt.txHash, contractAddress: testContract.address });
      expect(notes.length).toEqual(1);
      note = processUniqueNote(notes[0]);
    }

    // 3) Test the note was included
    await testContract.methods.test_note_inclusion(owner, arbitraryStorageSlot).send().wait();

    // 4) Finally, check that the claim process fails
    await expect(
      claimContract.withWallet(donorWallets[0]).methods.claim(note, donorWallets[0].getAddress()).send().wait(),
    ).rejects.toThrow();
  });

  it('cannot withdraw as a non-operator', async () => {
    const donationAmount = 500n;

    // 1) We add authwit so that the Crowdfunding contract can transfer donor's DNT
    const action = donationToken
      .withWallet(donorWallets[1])
      .methods.transfer_in_private(donorWallets[1].getAddress(), crowdfundingContract.address, donationAmount, 0);
    const witness = await donorWallets[1].createAuthWit({ caller: crowdfundingContract.address, action });

    // 2) We donate to the crowdfunding contract
    await crowdfundingContract
      .withWallet(donorWallets[1])
      .methods.donate(donationAmount)
      .send({ authWitnesses: [witness] })
      .wait();

    // The following should fail as msg_sender != operator
    await expect(
      crowdfundingContract.withWallet(donorWallets[1]).methods.withdraw(donationAmount).send().wait(),
    ).rejects.toThrow('Assertion failed: Not an operator');
  });

  it('cannot donate after a deadline', async () => {
    const donationAmount = 1000n;

    // 1) We add authwit so that the Crowdfunding contract can transfer donor's DNT

    const action = donationToken
      .withWallet(donorWallets[1])
      .methods.transfer_in_private(donorWallets[1].getAddress(), crowdfundingContract.address, donationAmount, 0);
    const witness = await donorWallets[1].createAuthWit({ caller: crowdfundingContract.address, action });

    // 2) We set next block timestamp to be after the deadline
    await cheatCodes.eth.warp(deadline + 1);

    // 3) We donate to the crowdfunding contract
    await expect(
      crowdfundingContract
        .withWallet(donorWallets[1])
        .methods.donate(donationAmount)
        .send({ authWitnesses: [witness] })
        .wait(),
    ).rejects.toThrow();
  });
});
