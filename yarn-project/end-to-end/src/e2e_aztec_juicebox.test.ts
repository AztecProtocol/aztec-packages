import { DefaultAccountContract } from '@aztec/accounts/defaults';
import {
  AccountManager,
  AccountWallet,
  AuthWitness,
  AuthWitnessProvider,
  AztecAddress,
  ContractArtifact,
  DebugLogger,
  ExtendedNote,
  Fr,
  GrumpkinScalar,
  Note,
  PXE,
  TxExecutionRequest,
  TxHash,
  Wallet,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
  generatePublicKey,
  getContractInstanceFromDeployParams,
} from '@aztec/aztec.js';
import { EthAddress, GrumpkinPrivateKey, PublicKey, computePartialAddress } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';
import { MultiSigAccountContract, MultiSigAccountContractArtifact } from '@aztec/noir-contracts.js';
import { ClaimContract } from '@aztec/noir-contracts.js/Claim';
import { CrowdFundingContract, CrowdFundingContractArtifact } from '@aztec/noir-contracts.js/CrowdFunding';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 200_000;

describe('e2e_aztec_crowdfunding', () => {
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
  let multisigOwnerA: Wallet;
  let multisigOwnerB: Wallet;
  let multisigOwnerC: Wallet;

  let deployerWallet: AccountWallet;
  let operatorWallet: AccountWallet;
  let donorWallets: AccountWallet[];
  let wallets: AccountWallet[];
  let logger: DebugLogger;

  let multisig: MultiSigAccountContract;
  let EthToken: TokenContract;
  let JuiceboxToken: TokenContract;
  let Crowdfunding: CrowdFundingContract;
  let Claims: ClaimContract;

  let crowdfundingPrivateKey;
  let crowdfundingPublicKey;
  let multisigPrivateKey: GrumpkinPrivateKey;
  let multisigPublicKey: PublicKey;
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
    ({ teardown, logger, pxe, wallets } = await setup(7));
    [deployerWallet, multisigOwnerA, multisigOwnerB, multisigOwnerC] = wallets;
    donorWallets = wallets.slice(4, 7);

    // This is the multisig encryption key
    multisigPrivateKey = GrumpkinScalar.random();
    multisigPublicKey = generatePublicKey(multisigPrivateKey);
    logger.info(`Multisig keys: private=${multisigPrivateKey.toString()} public=${multisigPublicKey.toString()}`);

    // Deploy the multisig contract via an account manager
    const ownerAddresses = [multisigOwnerA, multisigOwnerB, multisigOwnerC].map(w => w.getCompleteAddress().address);
    logger.info(`Multisig owners: ${ownerAddresses.map(a => a.toString()).join(', ')}`);
    const accountManager = getMultisigAccountManager(pxe, multisigPrivateKey, ownerAddresses, 2);
    operatorWallet = await accountManager.waitDeploy();
    multisig = await MultiSigAccountContract.at(operatorWallet.getCompleteAddress().address, operatorWallet);
    logger.info(`Multisig deployed at: ${multisig.address.toString()}`);

    // Deploying eth contract
    EthToken = await TokenContract.deploy(
      deployerWallet,
      deployerWallet.getAddress(),
      ethTokenMetadata.name,
      ethTokenMetadata.symbol,
      ethTokenMetadata.decimals,
    )
      .send()
      .deployed();
    logger(`ETH Token deployed to ${EthToken.address}`);

    JuiceboxToken = await TokenContract.deploy(
      deployerWallet,
      deployerWallet.getAddress(),
      rewardsTokenMetadata.name,
      rewardsTokenMetadata.symbol,
      rewardsTokenMetadata.decimals,
    )
      .send()
      .deployed();

    crowdfundingPrivateKey = GrumpkinScalar.random();
    crowdfundingPublicKey = generatePublicKey(crowdfundingPrivateKey);
    const salt = Fr.random();

    const args = [EthToken.address, operatorWallet.getAddress()];

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
      deployerWallet,
      EthToken.address,
      operatorWallet.getAddress(),
    )
      .send({ contractAddressSalt: salt })
      .wait();

    Crowdfunding = crowdfundingDeploymentReceipt.contract;

    logger(`Campaign contract deployed at ${Crowdfunding.address}`);

    await addFieldNote(
      Crowdfunding.address,
      new Fr(1),
      EthToken.address.toField(),
      crowdfundingDeploymentReceipt.txHash,
    );
    await addFieldNote(
      Crowdfunding.address,
      new Fr(2),
      operatorWallet.getAddress().toField(),
      crowdfundingDeploymentReceipt.txHash,
    );

    logger(`JBT deployed to ${JuiceboxToken.address}`);

    const claimContractReceipt = await ClaimContract.deploy(operatorWallet, Crowdfunding.address, JuiceboxToken.address)
      .send()
      .wait();

    Claims = claimContractReceipt.contract;

    await addFieldNote(Claims.address, new Fr(1), Crowdfunding.address.toField(), claimContractReceipt.txHash);
    await addFieldNote(Claims.address, new Fr(2), JuiceboxToken.address.toField(), claimContractReceipt.txHash);

    await JuiceboxToken.withWallet(deployerWallet).methods.set_minter(Claims.address, true).send().wait();
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
      EthToken.withWallet(deployerWallet).methods.set_minter(donorWallets[0].getAddress(), true).send().wait(),
      EthToken.withWallet(deployerWallet).methods.set_minter(donorWallets[1].getAddress(), true).send().wait(),
      EthToken.withWallet(deployerWallet).methods.set_minter(donorWallets[2].getAddress(), true).send().wait(),
    ]);

    const [txReceipt1, txReceipt2, txReceipt3] = await Promise.all([
      EthToken.withWallet(donorWallets[0]).methods.mint_private(1234n, secretHash).send().wait(),
      EthToken.withWallet(donorWallets[1]).methods.mint_private(2345n, secretHash).send().wait(),
      EthToken.withWallet(donorWallets[2]).methods.mint_private(3456n, secretHash).send().wait(),
    ]);

    await addPendingShieldNoteToPXE(donorWallets[0], 1234n, secretHash, txReceipt1.txHash, EthToken.address);
    await addPendingShieldNoteToPXE(donorWallets[1], 2345n, secretHash, txReceipt2.txHash, EthToken.address);
    await addPendingShieldNoteToPXE(donorWallets[2], 3456n, secretHash, txReceipt3.txHash, EthToken.address);

    await Promise.all([
      EthToken.withWallet(donorWallets[0])
        .methods.redeem_shield(donorWallets[0].getAddress(), 1234n, secret)
        .send()
        .wait(),
      EthToken.withWallet(donorWallets[1])
        .methods.redeem_shield(donorWallets[1].getAddress(), 2345n, secret)
        .send()
        .wait(),
      EthToken.withWallet(donorWallets[2])
        .methods.redeem_shield(donorWallets[2].getAddress(), 3456n, secret)
        .send()
        .wait(),
    ]);

    console.log(
      'balance of 1',
      await EthToken.withWallet(donorWallets[0]).methods.balance_of_private(donorWallets[0].getAddress()).view(),
    );
    console.log(
      'balance of 2',
      await EthToken.withWallet(donorWallets[1]).methods.balance_of_private(donorWallets[1].getAddress()).view(),
    );
    console.log(
      'balance of 3',
      await EthToken.withWallet(donorWallets[2]).methods.balance_of_private(donorWallets[2].getAddress()).view(),
    );

    const action = EthToken.withWallet(donorWallets[0]).methods.transfer(
      donorWallets[0].getAddress(),
      Crowdfunding.address,
      1000n,
      0,
    );
    const messageHash = computeAuthWitMessageHash(Crowdfunding.address, action.request());
    const witness = await donorWallets[0].createAuthWitness(messageHash);
    await donorWallets[0].addAuthWitness(witness);

    const donateTxReceipt = await Crowdfunding.withWallet(donorWallets[0]).methods.donate(1000n).send().wait({
      debug: true,
    });

    const allCampaignNotes = donateTxReceipt.debugInfo?.visibleNotes.filter(x =>
      x.contractAddress.equals(Crowdfunding.address),
    );

    expect(allCampaignNotes?.length).toEqual(1);

    console.log('rewardnote ', allCampaignNotes![0]);

    const noteNonces = await pxe.getNoteNonces(allCampaignNotes![0]);

    expect(noteNonces?.length).toEqual(1);

    console.log('noteNonce ', noteNonces![0]);

    await Claims.withWallet(donorWallets[0])
      .methods.claim({
        header: {
          contract_address: Crowdfunding.address,
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
      Claims.withWallet(donorWallets[0])
        .methods.claim({
          header: {
            contract_address: Crowdfunding.address,
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
      Claims.withWallet(donorWallets[0])
        .methods.claim({
          header: {
            contract_address: Crowdfunding.address,
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

    const balanceOfRewardToken = await JuiceboxToken.methods.balance_of_public(donorWallets[0].getAddress()).view();

    // Balance of public reward token should be the amount claimed
    expect(balanceOfRewardToken).toEqual(1000n);

    const balanceOfEthTokenBeforeWithdrawal = await EthToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();

    expect(balanceOfEthTokenBeforeWithdrawal).toEqual(0n);

    const withdrawAction = Crowdfunding.withWallet(operatorWallet).methods.withdraw(1000n);
    const authWits = await collectSignatures(getRequestsFromTxRequest(await withdrawAction.create()), [
      multisigOwnerA,
      multisigOwnerB,
    ]);
    await Promise.all(authWits.map(w => operatorWallet.addAuthWitness(w)));
    await withdrawAction.send().wait();

    const balanceOfEthTokenAfterWithdrawal = await EthToken.methods
      .balance_of_private(operatorWallet.getAddress())
      .view();

    expect(balanceOfEthTokenAfterWithdrawal).toEqual(1000n);
  });
});

const MULTISIG_MAX_OWNERS = 5;

class AccountManagerMultisigAccountContract extends DefaultAccountContract {
  constructor(private privateKey: GrumpkinPrivateKey, private owners: AztecAddress[], private threshold: number) {
    super(MultiSigAccountContractArtifact as ContractArtifact);
  }

  getDeploymentArgs() {
    return [
      padArrayEnd(this.owners, AztecAddress.ZERO, MULTISIG_MAX_OWNERS),
      this.privateKey.toBuffer(),
      this.threshold,
    ];
  }

  getAuthWitnessProvider(): AuthWitnessProvider {
    return {
      createAuthWitness(message: Fr): Promise<AuthWitness> {
        return Promise.resolve(new AuthWitness(message, []));
      },
    };
  }
}

function getMultisigAccountManager(
  pxe: PXE,
  privateKey: GrumpkinPrivateKey,
  owners: AztecAddress[],
  threshold: number,
) {
  return new AccountManager(pxe, privateKey, new AccountManagerMultisigAccountContract(privateKey, owners, threshold));
}

// Returns the requests to sign for a given tx request
function getRequestsFromTxRequest(txRequest: TxExecutionRequest) {
  return txRequest.authWitnesses.map(w => w.requestHash);
}

// Given a set of requests and an owner, returns the request that the owner needs to sign
function getRequestsToSignFor(requests: Fr[], owner: AztecAddress): Fr[] {
  return requests.map(request =>
    Fr.fromBuffer(
      pedersenHash(
        [request, owner.toField()].map(fr => fr.toBuffer()),
        0, // TODO: Use a non-zero generator point
      ),
    ),
  );
}

// Returns authwitnesses signed by the `owners` wallets for each of the `requests`
async function collectSignatures(requests: Fr[], owners: Wallet[]): Promise<AuthWitness[]> {
  // TODO: Rewrite this using a flatMap instead of two loops because it'd look nicer

  const authWits: AuthWitness[] = [];
  for (const ownerWallet of owners) {
    const messagesToSign = getRequestsToSignFor(requests, ownerWallet.getCompleteAddress().address);
    for (const messageToSign of messagesToSign) {
      authWits.push(await ownerWallet.createAuthWitness(messageToSign));
    }
  }
  return authWits;
}

// Adapted from end-to-end/src/e2e_token_contract.test.ts
async function addPendingShieldNoteToPXE(
  wallet: Wallet,
  token: AztecAddress,
  amount: bigint,
  secretHash: Fr,
  txHash: TxHash,
) {
  const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
  const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

  const note = new Note([new Fr(amount), secretHash]);
  const extendedNote = new ExtendedNote(
    note,
    wallet.getCompleteAddress().address,
    token,
    storageSlot,
    noteTypeId,
    txHash,
  );
  await wallet.addNote(extendedNote);
}
