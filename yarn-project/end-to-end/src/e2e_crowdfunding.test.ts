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
import { CrowdfundingContract, CrowdfundingContractArtifact } from '@aztec/noir-contracts.js/Crowdfunding';
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

  const rewardTokenMetadata = {
    name: 'Reward Token',
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
  let crowdfunding: CrowdfundingContract;
  let claims: ClaimContract;

  let crowdfundingPrivateKey;
  let crowdfundingPublicKey;
  let pxe: PXE;

  let valueNote!: ExtendedNote;
  let valueNoteNonce!: Fr;

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
    logger(`Donation Token deployed to ${donationToken.address}`);

    rewardToken = await TokenContract.deploy(
      operatorWallet,
      operatorWallet.getAddress(),
      rewardTokenMetadata.name,
      rewardTokenMetadata.symbol,
      rewardTokenMetadata.decimals,
    )
      .send()
      .deployed();

    crowdfundingPrivateKey = GrumpkinScalar.random();
    crowdfundingPublicKey = generatePublicKey(crowdfundingPrivateKey);
    const salt = Fr.random();

    const args = [donationToken.address, operatorWallet.getAddress()];

    const deployInfo = getContractInstanceFromDeployParams(
      CrowdfundingContractArtifact,
      args,
      salt,
      crowdfundingPublicKey,
      EthAddress.ZERO,
    );

    await pxe.registerAccount(crowdfundingPrivateKey, computePartialAddress(deployInfo));

    const crowdfundingDeploymentReceipt = await CrowdfundingContract.deployWithPublicKey(
      crowdfundingPublicKey,
      operatorWallet,
      donationToken.address,
      operatorWallet.getAddress(),
    )
      .send({ contractAddressSalt: salt })
      .wait();

    crowdfunding = crowdfundingDeploymentReceipt.contract;

    logger(`Crowdfunding contract deployed at ${crowdfunding.address}`);
    logger(`Reward Token deployed to ${rewardToken.address}`);

    const claimContractReceipt = await ClaimContract.deploy(operatorWallet, crowdfunding.address, rewardToken.address)
      .send()
      .wait();

    claims = claimContractReceipt.contract;

    await rewardToken.methods.set_minter(claims.address, true).send().wait();

    await mintDNTToDonors();
  });

  afterAll(() => teardown());

  const mintDNTToDonors = async () => {
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
      donationToken
        .withWallet(donorWallets[0])
        .methods.redeem_shield(donorWallets[0].getAddress(), 1234n, secret)
        .send()
        .wait(),
      donationToken
        .withWallet(donorWallets[1])
        .methods.redeem_shield(donorWallets[1].getAddress(), 2345n, secret)
        .send()
        .wait(),
      donationToken
        .withWallet(donorWallets[2])
        .methods.redeem_shield(donorWallets[2].getAddress(), 3456n, secret)
        .send()
        .wait(),
    ]);
  };

  it('full donor flow', async () => {
    const donationAmount = 1000n;

    // 1) We add authwit so that the Crowdfunding contract can transfer donor's DNT
    {
      const action = donationToken
        .withWallet(donorWallets[0])
        .methods.transfer(donorWallets[0].getAddress(), crowdfunding.address, donationAmount, 0);
      const messageHash = computeAuthWitMessageHash(crowdfunding.address, action.request());
      const witness = await donorWallets[0].createAuthWitness(messageHash);
      await donorWallets[0].addAuthWitness(witness);
    }

    // 2) We donate to the crowdfunding contract
    {
      const donateTxReceipt = await crowdfunding
        .withWallet(donorWallets[0])
        .methods.donate(donationAmount)
        .send()
        .wait({
          debug: true,
        });
      const allCrowdfundingNotes = donateTxReceipt.debugInfo?.visibleNotes.filter(x =>
        x.contractAddress.equals(crowdfunding.address),
      );
      expect(allCrowdfundingNotes!.length).toEqual(1);
      valueNote = allCrowdfundingNotes![0];
    }

    // 3) We claim the reward token via the Claim contract
    {
      // TODO(#4956): Make fetching the nonce manually unnecessary
      // To be able to perform the inclusion proof we need to fetch the nonce of the value note
      const noteNonces = await pxe.getNoteNonces(valueNote);
      expect(noteNonces?.length).toEqual(1);
      valueNoteNonce = noteNonces![0];

      await claims
        .withWallet(donorWallets[0])
        .methods.claim({
          header: {
            // eslint-disable-next-line camelcase
            contract_address: crowdfunding.address,
            // eslint-disable-next-line camelcase
            storage_slot: 3,
            // eslint-disable-next-line camelcase
            is_transient: false,
            nonce: valueNoteNonce,
          },
          value: valueNote.note.items[0],
          owner: valueNote.note.items[1],
          randomness: valueNote.note.items[2],
        })
        .send()
        .wait();
    }

    // Since the RWT is minted 1:1 with the DNT, the balance of the reward token should be equal to the donation amount
    const balanceRWT = await rewardToken.methods.balance_of_public(donorWallets[0].getAddress()).view();
    expect(balanceRWT).toEqual(donationAmount);

    const balanceDNTBeforeWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();
    expect(balanceDNTBeforeWithdrawal).toEqual(0n);

    // 4) At last, we withdraw the raised funds from the crowdfunding contract to the operator's address
    await crowdfunding.methods.withdraw(donationAmount).send().wait();

    const balanceDNTAfterWithdrawal = await donationToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();

    // Operator should have all the DNT now
    expect(balanceDNTAfterWithdrawal).toEqual(donationAmount);
  });

  it('should not be able to claim twice', async () => {
    await expect(
      claims
        .withWallet(donorWallets[0])
        .methods.claim({
          header: {
            // eslint-disable-next-line camelcase
            contract_address: crowdfunding.address,
            // eslint-disable-next-line camelcase
            storage_slot: 3,
            // eslint-disable-next-line camelcase
            is_transient: false,
            nonce: valueNoteNonce,
          },
          value: valueNote.note.items[0],
          owner: valueNote.note.items[1],
          randomness: valueNote.note.items[2],
        })
        .send()
        .wait(),
    ).rejects.toThrow();
  });

  it('should not be able to claim with a non-existent note', async () => {
    await expect(
      claims
        .withWallet(donorWallets[0])
        .methods.claim({
          header: {
            // eslint-disable-next-line camelcase
            contract_address: crowdfunding.address,
            // eslint-disable-next-line camelcase
            storage_slot: 3,
            // eslint-disable-next-line camelcase
            is_transient: false,
            nonce: valueNoteNonce,
          },
          value: valueNote.note.items[0],
          owner: valueNote.note.items[1],
          randomness: valueNote.note.items[2],
        })
        .send()
        .wait(),
    ).rejects.toThrow();
  });
});
