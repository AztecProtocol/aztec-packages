import {
  AccountWallet,
  AztecAddress,
  DebugLogger,
  ExtendedNote,
  Fr,
  GrumpkinScalar,
  Note,
  PXE,
  TxHash,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
  generatePublicKey,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { EthAddress, computePartialAddress } from '@aztec/circuits.js';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';
import { CrowdFundingContract, CrowdFundingContractArtifact } from '@aztec/noir-contracts.js/CrowdFunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 200_000;

describe('e2e_crowdfunding', () => {
  jest.setTimeout(TIMEOUT);

  const donationTokenMetadata = {
    name: 'Donation Token',
    symbol: 'DNT',
    decimals: 18n,
  };

  const rewardsTokenMetadata = {
    name: 'Rewards Token',
    symbol: 'RWT',
    decimals: 18n,
  };

  let teardown: () => Promise<void>;
  let operatorWallet: AccountWallet;
  let donorWallets: AccountWallet[];
  let wallets: AccountWallet[];
  let logger: DebugLogger;

  let donationToken: TokenContract;
  let rewardToken: TokenContract;
  let crowdfunding: CrowdFundingContract;
  let claims: ClaimContract;

  let crowdfundingPrivateKey;
  let crowdfundingPublicKey;
  let pxe: PXE;

  const addPendingShieldNoteToPXE = async (
    wallet: AccountWallet,
    amount: bigint,
    secretHash: Fr,
    txHash: TxHash,
    address: AztecAddress,
  ) => {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote
    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(note, wallet.getAddress(), address, storageSlot, noteTypeId, txHash);
    await wallet.addNote(extendedNote);
  };

  beforeAll(async () => {
    ({ teardown, logger, pxe, wallets } = await setup(5));
    operatorWallet = wallets[0];
    donorWallets = wallets.slice(1);

    donationToken = await TokenContract.deploy(
      operatorWallet,
      operatorWallet.getAddress(),
      donationTokenMetadata.name,
      donationTokenMetadata.symbol,
      donationTokenMetadata.decimals,
    )
      .send()
      .deployed();
    logger(`ETH Token deployed to ${donationToken.address}`);

    rewardToken = await TokenContract.deploy(
      operatorWallet,
      operatorWallet.getAddress(),
      rewardsTokenMetadata.name,
      rewardsTokenMetadata.symbol,
      rewardsTokenMetadata.decimals,
    )
      .send()
      .deployed();

    crowdfundingPrivateKey = GrumpkinScalar.random();
    crowdfundingPublicKey = generatePublicKey(crowdfundingPrivateKey);
    const salt = Fr.random();

    const args = [donationToken.address, operatorWallet.getAddress()];

    const deployInfo = getContractInstanceFromDeployParams(
      CrowdFundingContractArtifact,
      args,
      salt,
      crowdfundingPublicKey,
      EthAddress.ZERO,
    );

    await pxe.registerAccount(crowdfundingPrivateKey, computePartialAddress(deployInfo));

    const crowdfundingDeploymentReceipt = await CrowdFundingContract.deployWithPublicKey(
      crowdfundingPublicKey,
      operatorWallet,
      donationToken.address,
      operatorWallet.getAddress(),
    )
      .send({ contractAddressSalt: salt })
      .wait();

    crowdfunding = crowdfundingDeploymentReceipt.contract;

    logger(`Campaign contract deployed at ${crowdfunding.address}`);

    await addFieldNote(
      crowdfunding.address,
      new Fr(1),
      donationToken.address.toField(),
      crowdfundingDeploymentReceipt.txHash,
    );
    await addFieldNote(
      crowdfunding.address,
      new Fr(2),
      operatorWallet.getAddress().toField(),
      crowdfundingDeploymentReceipt.txHash,
    );

    logger(`JBT deployed to ${rewardToken.address}`);

    const claimContractReceipt = await ClaimContract.deploy(operatorWallet, crowdfunding.address, rewardToken.address)
      .send()
      .wait();

    claims = claimContractReceipt.contract;

    await addFieldNote(claims.address, new Fr(1), crowdfunding.address.toField(), claimContractReceipt.txHash);
    await addFieldNote(claims.address, new Fr(2), rewardToken.address.toField(), claimContractReceipt.txHash);

    await rewardToken.methods.set_minter(claims.address, true).send().wait();
  }, 100_000);

  afterAll(() => teardown());

  const addFieldNote = async (contractAddress: AztecAddress, storageSlot: Fr, field: Fr, txHash: TxHash) => {
    // Add the note
    const note = new Note([field]);
    const noteTypeId = new Fr(7010510110810078111116101n); // FieldNote
    for (const wallet of wallets) {
      const extendedNote = new ExtendedNote(
        note,
        wallet.getCompleteAddress().address,
        contractAddress,
        storageSlot,
        noteTypeId,
        txHash,
      );
      await wallet.addNote(extendedNote);
    }
  };

  it('donor flow', async () => {
    const secret = new Fr(100);
    const secretHash = computeMessageSecretHash(secret);

    await Promise.all([
      donationToken.withWallet(operatorWallet).methods.set_minter(donorWallets[0].getAddress(), true).send().wait(),
      donationToken.withWallet(operatorWallet).methods.set_minter(donorWallets[1].getAddress(), true).send().wait(),
      donationToken.withWallet(operatorWallet).methods.set_minter(donorWallets[2].getAddress(), true).send().wait(),
    ]);

    const [txReceipt1, txReceipt2, txReceipt3] = await Promise.all([
      donationToken.withWallet(donorWallets[0]).methods.mint_private(1234n, secretHash).send().wait(),
      donationToken.withWallet(donorWallets[1]).methods.mint_private(2345n, secretHash).send().wait(),
      donationToken.withWallet(donorWallets[2]).methods.mint_private(3456n, secretHash).send().wait(),
    ]);

    await addPendingShieldNoteToPXE(
      donorWallets[0],
      1234n,
      secretHash,
      txReceipt1.txHash,
      donationToken.withWallet(operatorWallet).address,
    );
    await addPendingShieldNoteToPXE(
      donorWallets[1],
      2345n,
      secretHash,
      txReceipt2.txHash,
      donationToken.withWallet(operatorWallet).address,
    );
    await addPendingShieldNoteToPXE(
      donorWallets[2],
      3456n,
      secretHash,
      txReceipt3.txHash,
      donationToken.withWallet(operatorWallet).address,
    );

    await Promise.all([
      donationToken.withWallet(donorWallets[0])
        .methods.redeem_shield(donorWallets[0].getAddress(), 1234n, secret)
        .send()
        .wait(),
      donationToken.withWallet(donorWallets[1])
        .methods.redeem_shield(donorWallets[1].getAddress(), 2345n, secret)
        .send()
        .wait(),
      donationToken.withWallet(donorWallets[2])
        .methods.redeem_shield(donorWallets[2].getAddress(), 3456n, secret)
        .send()
        .wait(),
    ]);

    console.log(
      'balance of 1',
      await donationToken.withWallet(donorWallets[0]).methods.balance_of_private(donorWallets[0].getAddress()).view(),
    );
    console.log(
      'balance of 2',
      await donationToken.withWallet(donorWallets[1]).methods.balance_of_private(donorWallets[1].getAddress()).view(),
    );
    console.log(
      'balance of 3',
      await donationToken.withWallet(donorWallets[2]).methods.balance_of_private(donorWallets[2].getAddress()).view(),
    );

    const action = donationToken.withWallet(donorWallets[0]).methods.transfer(
      donorWallets[0].getAddress(),
      crowdfunding.address,
      1000n,
      0,
    );
    const messageHash = computeAuthWitMessageHash(crowdfunding.address, action.request());
    const witness = await donorWallets[0].createAuthWitness(messageHash);
    await donorWallets[0].addAuthWitness(witness);

    const donateTxReceipt = await crowdfunding.withWallet(donorWallets[0]).methods.donate(1000n).send().wait({
      debug: true,
    });

    const allCampaignNotes = donateTxReceipt.debugInfo?.visibleNotes.filter(x =>
      x.contractAddress.equals(crowdfunding.address),
    );

    expect(allCampaignNotes?.length).toEqual(1);

    console.log('rewardnote ', allCampaignNotes![0]);

    const noteNonces = await pxe.getNoteNonces(allCampaignNotes![0]);

    expect(noteNonces?.length).toEqual(1);

    console.log('noteNonce ', noteNonces![0]);

    await claims.withWallet(donorWallets[0])
      .methods.claim({
        header: {
          contract_address: crowdfunding.address,
          storage_slot: 3,
          is_transient: false,
          nonce: noteNonces![0],
        },
        value: allCampaignNotes![0].note.items[0],
        owner: allCampaignNotes![0].note.items[1],
        randomness: allCampaignNotes![0].note.items[2],
      })
      .send()
      .wait();

    // Should not be able to claim a non-existent note
    await expect(
      claims.withWallet(donorWallets[0])
        .methods.claim({
          header: {
            contract_address: crowdfunding.address,
            storage_slot: 3,
            is_transient: false,
            nonce: noteNonces![0],
          },
          value: allCampaignNotes![0].note.items[0],
          owner: allCampaignNotes![0].note.items[1],
          randomness: Fr.ZERO,
        })
        .send()
        .wait(),
    ).rejects.toThrow();

    // Should not be able to claim again
    await expect(
      claims.withWallet(donorWallets[0])
        .methods.claim({
          header: {
            contract_address: crowdfunding.address,
            storage_slot: 3,
            is_transient: false,
            nonce: noteNonces![0],
          },
          value: allCampaignNotes![0].note.items[0],
          owner: allCampaignNotes![0].note.items[1],
          randomness: allCampaignNotes![0].note.items[2],
        })
        .send()
        .wait(),
    ).rejects.toThrow();

    const balanceOfRewardToken = await rewardToken.methods.balance_of_public(donorWallets[0].getAddress()).view();

    // Balance of public reward token should be the amount claimed
    expect(balanceOfRewardToken).toEqual(1000n);

    const balanceOfEthTokenBeforeWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();

    expect(balanceOfEthTokenBeforeWithdrawal).toEqual(0n);

    await crowdfunding.methods.withdraw(1000n).send().wait();

    const balanceOfEthTokenAfterWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();

    expect(balanceOfEthTokenAfterWithdrawal).toEqual(1000n);
  });
});
