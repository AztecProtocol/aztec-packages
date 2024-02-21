import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
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
import { CrowdFundingContract, CrowdFundingContractArtifact } from '@aztec/noir-contracts.js/CrowdFunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import { EthAddress, computePartialAddress } from '@aztec/circuits.js';

const TIMEOUT = 200_000;

describe('e2e_token_contract', () => {
  jest.setTimeout(TIMEOUT);

  const ethTokenMetadata = {
    name: 'Aztec Token',
    symbol: 'AZT',
    decimals: 18n,
  };

  const rewardsTokenMetadata = {
    name: 'Rewards Token',
    symbol: 'RWT',
    decimals: 18n,
  };

  let teardown: () => Promise<void>;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  const DonationCurrencyToken: TokenContract[] = [];
  const RewardToken: TokenContract[] = [];
  const JuiceboxContract: CrowdFundingContract[] = [];
  const Claims: ClaimContract[] = [];


  let crowdfundingPrivateKey;
  let crowdfundingPublicKey;
  let pxe: PXE;

  const addPendingShieldNoteToPXE = async (
    accountIndex: number,
    amount: bigint,
    secretHash: Fr,
    txHash: TxHash,
    address: AztecAddress,
  ) => {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote
    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      accounts[accountIndex].address,
      address,
      storageSlot,
      noteTypeId,
      txHash,
    );
    await wallets[accountIndex].addNote(extendedNote);
  };

  beforeAll(async () => {
    ({ teardown, logger, wallets, accounts, pxe } = await setup(5));

    DonationCurrencyToken.push(
      await TokenContract.deploy(
        wallets[0],
        accounts[0],
        ethTokenMetadata.name,
        ethTokenMetadata.symbol,
        ethTokenMetadata.decimals,
      )
        .send()
        .deployed(),
    );
    logger(`ETH Token deployed to ${DonationCurrencyToken[0].address}`);

    DonationCurrencyToken[1] = DonationCurrencyToken[0].withWallet(wallets[1]);
    DonationCurrencyToken[2] = DonationCurrencyToken[0].withWallet(wallets[2]);
    DonationCurrencyToken[3] = DonationCurrencyToken[0].withWallet(wallets[3]);

    RewardToken[0] = await TokenContract.deploy(
      wallets[0],
      wallets[0].getAddress(),
      rewardsTokenMetadata.name,
      rewardsTokenMetadata.symbol,
      rewardsTokenMetadata.decimals,
    ).send().deployed();
    RewardToken[1] = RewardToken[0].withWallet(wallets[1]);
    RewardToken[2] = RewardToken[0].withWallet(wallets[2]);
    RewardToken[3] = RewardToken[0].withWallet(wallets[3]);

    crowdfundingPrivateKey = GrumpkinScalar.random();
    crowdfundingPublicKey = generatePublicKey(crowdfundingPrivateKey);
    const salt = Fr.random();

    const args = [DonationCurrencyToken[0].address, wallets[0].getAddress()];

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
      wallets[0],
      DonationCurrencyToken[0].address,
      wallets[0].getAddress(),
    )
    .send({ contractAddressSalt: salt })
    .wait();

    JuiceboxContract[0] = crowdfundingDeploymentReceipt.contract

    logger(`Campaign contract deployed at ${JuiceboxContract[0].address}`);

    await addFieldNote(JuiceboxContract[0].address, new Fr(1), DonationCurrencyToken[0].address.toField(), crowdfundingDeploymentReceipt.txHash);
    await addFieldNote(JuiceboxContract[0].address, new Fr(2), wallets[0].getAddress().toField(), crowdfundingDeploymentReceipt.txHash);

    JuiceboxContract[1] = JuiceboxContract[0].withWallet(wallets[1]);
    JuiceboxContract[2] = JuiceboxContract[0].withWallet(wallets[2]);
    JuiceboxContract[3] = JuiceboxContract[0].withWallet(wallets[3]);

    logger(`JBT deployed to ${RewardToken[0].address}`);

    const claimContractReceipt = await ClaimContract.deploy(
      wallets[0],
      JuiceboxContract[0].address,
      RewardToken[0].address,
    ).send().wait();

    Claims[0] = claimContractReceipt.contract;

    await addFieldNote(Claims[0].address, new Fr(1), JuiceboxContract[0].address.toField(), claimContractReceipt.txHash);
    await addFieldNote(Claims[0].address, new Fr(2), RewardToken[0].address.toField(), claimContractReceipt.txHash);

    await RewardToken[0].methods.set_minter(Claims[0].address, true).send().wait();
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

  describe('Reading constants', () => {
    it('must exist', async () => {
      console.log('test');
      const secret = new Fr(100);
      const secretHash = computeMessageSecretHash(secret);

      await Promise.all([
        DonationCurrencyToken[0].methods.set_minter(wallets[1].getAddress(), true).send().wait(),
        DonationCurrencyToken[0].methods.set_minter(wallets[2].getAddress(), true).send().wait(),
        DonationCurrencyToken[0].methods.set_minter(wallets[3].getAddress(), true).send().wait(),
      ]);

      const [txReceipt1, txReceipt2, txReceipt3] = await Promise.all([
        DonationCurrencyToken[1].methods.mint_private(1234n, secretHash).send().wait(),
        DonationCurrencyToken[2].methods.mint_private(2345n, secretHash).send().wait(),
        DonationCurrencyToken[3].methods.mint_private(3456n, secretHash).send().wait(),
      ]);

      await addPendingShieldNoteToPXE(0, 1234n, secretHash, txReceipt1.txHash, DonationCurrencyToken[0].address);
      await addPendingShieldNoteToPXE(0, 2345n, secretHash, txReceipt2.txHash, DonationCurrencyToken[0].address);
      await addPendingShieldNoteToPXE(0, 3456n, secretHash, txReceipt3.txHash, DonationCurrencyToken[0].address);

      await Promise.all([
        DonationCurrencyToken[1].methods.redeem_shield(wallets[1].getAddress(), 1234n, secret).send().wait(),
        DonationCurrencyToken[2].methods.redeem_shield(wallets[2].getAddress(), 2345n, secret).send().wait(),
        DonationCurrencyToken[3].methods.redeem_shield(wallets[3].getAddress(), 3456n, secret).send().wait(),
      ]);

      console.log('balance of 1', await DonationCurrencyToken[1].methods.balance_of_private(wallets[1].getAddress()).view());
      console.log('balance of 2', await DonationCurrencyToken[2].methods.balance_of_private(wallets[2].getAddress()).view());
      console.log('balance of 3', await DonationCurrencyToken[3].methods.balance_of_private(wallets[3].getAddress()).view());

      const action = DonationCurrencyToken[1].methods.transfer(accounts[1].address, JuiceboxContract[0].address, 1000n, 0);
      const messageHash = computeAuthWitMessageHash(JuiceboxContract[0].address, action.request());
      const witness = await wallets[1].createAuthWitness(messageHash);
      await wallets[1].addAuthWitness(witness);

      const donateTxReceipt = await JuiceboxContract[1].methods.donate(1000n).send().wait({
        debug: true
      });

      const allCampaignNotes = donateTxReceipt.debugInfo?.visibleNotes.filter(x => x.contractAddress.equals(JuiceboxContract[0].address));

      expect(allCampaignNotes?.length).toEqual(1);

      console.log('rewardnote ', allCampaignNotes![0])

      const noteNonces = await pxe.getNoteNonces(allCampaignNotes![0]);

      expect(noteNonces?.length).toEqual(1);

      console.log('noteNonce ', noteNonces![0]);

      await Claims[0].methods.claim({
        header: {
          contract_address: JuiceboxContract[0].address,
          storage_slot: 3,
          is_transient: false,
          nonce: noteNonces![0],
        },
        value: allCampaignNotes![0].note.items[0],
        owner:  allCampaignNotes![0].note.items[1],
        randomness: allCampaignNotes![0].note.items[2],
      }).send().wait();
    //   // console.log('Reward balance of 1', await RewardToken[1].methods.getBalance(wallets[1].getAddress()).view());

    //   // await JuiceboxContract[0].methods.withdraw(1000n).send().wait();

    //   // console.log('Balance of campaign organizaer', await DonationCurrencyToken[0].methods.balance_of_private(wallets[0].getAddress()).view());
    });
  });
});
