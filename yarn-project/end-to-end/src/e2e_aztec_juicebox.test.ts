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
  TxStatus,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { decodeFunctionSignature } from '@aztec/foundation/abi';
import { ReaderContract } from '@aztec/noir-contracts.js/Reader';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';

import { setup } from './fixtures/utils.js';
import { TokenSimulator } from './simulators/token_simulator.js';

const TIMEOUT = 90_000;

describe('e2e_token_contract', () => {
  jest.setTimeout(TIMEOUT);

  const ethTokenMetadata = {
    name: 'Aztec Token',
    symbol: 'AZT',
    decimals: 18n,
  };

  const juiceboxTokenMetadata = {
    name: 'Juicebox Token',
    symbol: 'JBT',
    decimals: 18n,
  };

  let teardown: () => Promise<void>;
  let wallets: AccountWallet[];
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  const EthToken: TokenContract[] = [];
  const JuiceboxToken: TokenContract[] = [];

  const addPendingShieldNoteToPXE = async (accountIndex: number, amount: bigint, secretHash: Fr, txHash: TxHash, address: AztecAddress) => {
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
    ({ teardown, logger, wallets, accounts } = await setup(4));

    TokenContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });

    EthToken.push(await TokenContract.deploy(
      wallets[0],
      accounts[0],
      ethTokenMetadata.name,
      ethTokenMetadata.symbol,
      ethTokenMetadata.decimals,
    ).send().deployed());
    logger(`Token deployed to ${EthToken[0].address}`);

    JuiceboxToken[0] = await TokenContract.deploy(
      wallets[0],
      accounts[0],
      juiceboxTokenMetadata.name,
      juiceboxTokenMetadata.symbol,
      juiceboxTokenMetadata.decimals,
    ).send().deployed();
    logger(`Token deployed to ${JuiceboxToken[0].address}`);


    EthToken[1] = EthToken[0].withWallet(wallets[1]);
    EthToken[2] = EthToken[0].withWallet(wallets[2]);
    EthToken[3] = EthToken[0].withWallet(wallets[3]);

    JuiceboxToken[1] = JuiceboxToken[0].withWallet(wallets[1]);
    JuiceboxToken[2] = JuiceboxToken[0].withWallet(wallets[2]);
    JuiceboxToken[3] = JuiceboxToken[0].withWallet(wallets[3]);
  }, 100_000);

  afterAll(() => teardown());

  describe('Reading constants', () => {
    it('must exist', async () => {
      const secret = new Fr(100);
      const secretHash = computeMessageSecretHash(secret);

      const ethAdmin = await EthToken[0].methods.admin().view();
      const juiceboxAdmin = await JuiceboxToken[0].methods.admin().view();

      await EthToken[0].methods.set_minter(wallets[1].getAddress(), true).send().wait();
      await EthToken[0].methods.set_minter(wallets[2].getAddress(), true).send().wait();
      await EthToken[0].methods.set_minter(wallets[3].getAddress(), true).send().wait();

      const txReceipt1 = await EthToken[1].methods.mint_private(1234n, secretHash).send().wait();
      const txReceipt2 = await EthToken[2].methods.mint_private(2345n, secretHash).send().wait();
      const txReceipt3 = await EthToken[3].methods.mint_private(3456n, secretHash).send().wait();

      await addPendingShieldNoteToPXE(0, 1234n, secretHash, txReceipt1.txHash, EthToken[0].address);
      await addPendingShieldNoteToPXE(0, 2345n, secretHash, txReceipt2.txHash, EthToken[0].address);
      await addPendingShieldNoteToPXE(0, 3456n, secretHash, txReceipt3.txHash, EthToken[0].address);

      await EthToken[1].methods.redeem_shield(wallets[1].getAddress(), 1234n, secret).send().wait();
      await EthToken[2].methods.redeem_shield(wallets[2].getAddress(), 2345n, secret).send().wait();
      await EthToken[3].methods.redeem_shield(wallets[3].getAddress(), 3456n, secret).send().wait();

      console.log('balance of 1', await EthToken[1].methods.balance_of_private(wallets[1].getAddress()).view());
      console.log('balance of 2', await EthToken[2].methods.balance_of_private(wallets[2].getAddress()).view());
      console.log('balance of 3', await EthToken[3].methods.balance_of_private(wallets[3].getAddress()).view());
    });
  });
});
