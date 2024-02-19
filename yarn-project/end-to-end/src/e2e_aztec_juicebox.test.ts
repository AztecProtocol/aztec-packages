import {
  AccountWallet,
  AztecAddress,
  CompleteAddress,
  DebugLogger,
  ExtendedNote,
  Fr,
  FunctionSelector,
  Note,
  TxHash,
  TxReceipt,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { decodeFunctionSignature } from '@aztec/foundation/abi';
import { CrowdFundingContract } from '@aztec/noir-contracts.js/CrowdFunding';
import { EasyPrivateTokenContract } from '@aztec/noir-contracts.js/EasyPrivateToken';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';

const TIMEOUT = 200_000;

describe('e2e_token_contract', () => {
  jest.setTimeout(TIMEOUT);

  const ethTokenMetadata = {
    name: 'Aztec Token',
    symbol: 'AZT',
    decimals: 18n,
  };

  // const juiceboxTokenMetadata = {
  //   name: 'Juicebox Token',
  //   symbol: 'JBT',
  //   decimals: 18n,
  // };

  let teardown: () => Promise<void>;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  const EthToken: TokenContract[] = [];
  const JuiceboxToken: EasyPrivateTokenContract[] = [];

  let escrowWallet: AccountWallet;

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
    ({ teardown, logger, wallets, accounts } = await setup(5));

    TokenContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });

    EthToken.push(
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
    logger(`Token deployed to ${EthToken[0].address}`);

    JuiceboxToken[0] = await EasyPrivateTokenContract.deploy(wallets[0], 0n, accounts[0]).send().deployed();
    JuiceboxToken[1] = JuiceboxToken[0].withWallet(wallets[1]);
    JuiceboxToken[2] = JuiceboxToken[0].withWallet(wallets[2]);
    JuiceboxToken[3] = JuiceboxToken[0].withWallet(wallets[3]);

    logger(`Token deployed to ${JuiceboxToken[0].address}`);

    EthToken[1] = EthToken[0].withWallet(wallets[1]);
    EthToken[2] = EthToken[0].withWallet(wallets[2]);
    EthToken[3] = EthToken[0].withWallet(wallets[3]);

    JuiceboxToken[1] = JuiceboxToken[0].withWallet(wallets[1]);
    JuiceboxToken[2] = JuiceboxToken[0].withWallet(wallets[2]);
    JuiceboxToken[3] = JuiceboxToken[0].withWallet(wallets[3]);

    // This will be an special wallet in the future using a custom account contract
    escrowWallet = wallets[4];
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
      const secret = new Fr(100);
      const secretHash = computeMessageSecretHash(secret);

      // const ethAdmin = await EthToken[0].methods.admin().view();

      await Promise.all([
        EthToken[0].methods.set_minter(wallets[1].getAddress(), true).send().wait(),
        EthToken[0].methods.set_minter(wallets[2].getAddress(), true).send().wait(),
        EthToken[0].methods.set_minter(wallets[3].getAddress(), true).send().wait(),
      ]);

      const [txReceipt1, txReceipt2, txReceipt3] = await Promise.all([
        EthToken[1].methods.mint_private(1234n, secretHash).send().wait(),
        EthToken[2].methods.mint_private(2345n, secretHash).send().wait(),
        EthToken[3].methods.mint_private(3456n, secretHash).send().wait(),
      ]);

      await addPendingShieldNoteToPXE(0, 1234n, secretHash, txReceipt1.txHash, EthToken[0].address);
      await addPendingShieldNoteToPXE(0, 2345n, secretHash, txReceipt2.txHash, EthToken[0].address);
      await addPendingShieldNoteToPXE(0, 3456n, secretHash, txReceipt3.txHash, EthToken[0].address);

      await Promise.all([
        EthToken[1].methods.redeem_shield(wallets[1].getAddress(), 1234n, secret).send().wait(),
        EthToken[2].methods.redeem_shield(wallets[2].getAddress(), 2345n, secret).send().wait(),
        EthToken[3].methods.redeem_shield(wallets[3].getAddress(), 3456n, secret).send().wait(),
      ]);

      console.log('balance of 1', await EthToken[1].methods.balance_of_private(wallets[1].getAddress()).view());
      console.log('balance of 2', await EthToken[2].methods.balance_of_private(wallets[2].getAddress()).view());
      console.log('balance of 3', await EthToken[3].methods.balance_of_private(wallets[3].getAddress()).view());

      const deploymentReceipt = await CrowdFundingContract.deploy(
        wallets[0],
        EthToken[0].address,
        JuiceboxToken[0].address,
        escrowWallet.getAddress(),
      )
        .send()
        .wait();

      const CrowdFunding = deploymentReceipt.contract;

      await addFieldNote(CrowdFunding.address, new Fr(1), EthToken[0].address.toField(), deploymentReceipt.txHash);
      await addFieldNote(CrowdFunding.address, new Fr(2), JuiceboxToken[0].address.toField(), deploymentReceipt.txHash);
      await addFieldNote(
        CrowdFunding.address,
        new Fr(3),
        escrowWallet.getAddress().toField(),
        deploymentReceipt.txHash,
      );

      await CrowdFunding.withWallet(wallets[1]).methods.donate(1000n).send().wait();

      console.log('Reward balance of 1', await JuiceboxToken[1].methods.getBalance(wallets[1].getAddress()).view());
    });
  });
});
