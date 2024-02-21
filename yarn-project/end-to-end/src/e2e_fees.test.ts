import {
  AccountWallet,
  AztecAddress,
  AztecNode,
  Contract,
  ContractDeployer,
  DebugLogger,
  ExtendedNote,
  FeePaymentMethod,
  Fr,
  FunctionCall,
  FunctionSelector,
  NativeFeePaymentMethod,
  Note,
  TxHash,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { CompleteAddress, FunctionData } from '@aztec/circuits.js';
import { decodeFunctionSignature } from '@aztec/foundation/abi';
import { BananaFPCContract, GasTokenContract, TokenContract } from '@aztec/noir-contracts.js';
import { getCanonicalGasToken } from '@aztec/protocol-contracts/gas-token';

import { exit } from 'process';

import { setup } from './fixtures/utils.js';

describe('e2e_fees', () => {
  let aliceAddress: AztecAddress;
  let _bobAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let gasTokenContract: GasTokenContract;
  let testContract: TokenContract;

  let wallets: AccountWallet[];
  let wallet: AccountWallet;
  let accounts: CompleteAddress[];
  let aztecNode: AztecNode;
  let logger: DebugLogger;

  beforeAll(async () => {
    process.env.PXE_URL = '';
    ({ accounts, aztecNode, wallet, wallets, logger } = await setup(3));

    TokenContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });
    BananaFPCContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });
    GasTokenContract.artifact.functions.forEach(fn => {
      const sig = decodeFunctionSignature(fn.name, fn.parameters);
      logger(`Function ${sig} and the selector: ${FunctionSelector.fromNameAndParameters(fn.name, fn.parameters)}`);
    });

    await aztecNode.setConfig({
      feeRecipient: accounts.at(-1)!.address,
    });
    const canonicalGasToken = getCanonicalGasToken();
    const deployer = new ContractDeployer(canonicalGasToken.artifact, wallet);
    const { contract } = await deployer
      .deploy()
      .send({
        contractAddressSalt: canonicalGasToken.instance.salt,
      })
      .wait();

    gasTokenContract = contract as GasTokenContract;
    logger(`Gas token contract deployed at ${gasTokenContract.address}`);
    aliceAddress = accounts.at(0)!.address;
    _bobAddress = accounts.at(1)!.address;
    sequencerAddress = accounts.at(-1)!.address;

    testContract = await TokenContract.deploy(wallet, aliceAddress, 'Test', 'TEST', 1).send().deployed();
    logger(`Test contract deployed at ${testContract.address}`);

    // Alice gets a balance of 1000 gas token
    await gasTokenContract.methods.redeem_bridged_balance(1000, accounts[0].address).send().wait();
  }, 100_000);

  it('deploys gas token contract at canonical address', () => {
    expect(gasTokenContract.address).toEqual(getCanonicalGasToken().address);
  });

  describe.skip('NativeFeePaymentMethod', () => {
    it('pays out the expected fee to the sequencer', async () => {
      await testContract.methods
        .mint_public(aliceAddress, 1000)
        .send({
          fee: {
            maxFee: 1,
            paymentMethod: new NativeFeePaymentMethod(),
          },
        })
        .wait();

      const [sequencerBalance, aliceBalance] = await Promise.all([
        gasTokenContract.methods.balance_of_public(sequencerAddress).view(),
        gasTokenContract.methods.balance_of_public(aliceAddress).view(),
      ]);

      expect(sequencerBalance).toEqual(1n);
      expect(aliceBalance).toEqual(999n);
    });
  });
  describe('BANANA', () => {
    let bananas: TokenContract;
    let bananaPay: BananaFPCContract;

    const TOKEN_NAME = 'BananaCoin';
    const TOKEN_SYMBOL = 'BAC';
    const TOKEN_DECIMALS = 18n;

    const addPendingShieldNoteToPXE = async (accountIndex: number, amount: bigint, secretHash: Fr, txHash: TxHash) => {
      const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
      const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

      const note = new Note([new Fr(amount), secretHash]);
      const extendedNote = new ExtendedNote(
        note,
        accounts[accountIndex].address,
        bananas.address,
        storageSlot,
        noteTypeId,
        txHash,
      );
      await wallets[accountIndex].addNote(extendedNote);
    };

    it('deploy banana-coin and mint coins to alice privately', async () => {
      bananas = await TokenContract.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
        .send()
        .deployed();

      logger(`BananaCoin deployed at ${bananas.address}`);

      const amount = 100n;
      const secret = Fr.random();
      const secretHash = computeMessageSecretHash(secret);
      const receipt = await bananas.methods.mint_private(amount, secretHash).send().wait();

      await addPendingShieldNoteToPXE(0, amount, secretHash, receipt.txHash);

      const txClaim = bananas.methods.redeem_shield(accounts[0].address, amount, secret).send();
      const receiptClaim = await txClaim.wait({ debug: true });
      const { visibleNotes } = receiptClaim.debugInfo!;
      expect(visibleNotes[0].note.items[0].toBigInt()).toBe(amount);
    }, 45_000);

    it('deploy banana pay and deposit fees into it', async () => {
      bananaPay = await BananaFPCContract.deploy(wallets[0], bananas.address, gasTokenContract.address)
        .send()
        .deployed();
      logger(`bananaPay deployed at ${bananaPay.address}`);

      await gasTokenContract.methods.redeem_bridged_balance(500, bananaPay.address).send().wait();
    }, 30_000);

    const balances = async (symbol: string, contract: Contract) => {
      const [sequencerBalance, aliceBalance, bananaPayBalance] = await Promise.all([
        contract.methods.balance_of_public(sequencerAddress).view(),
        contract.methods.balance_of_public(aliceAddress).view(),
        contract.methods.balance_of_public(bananaPay.address).view(),
      ]);

      logger(
        `${symbol} balances: Alice ${aliceBalance}, bananaPay: ${bananaPayBalance}, sequencer: ${sequencerBalance}`,
      );

      return { sequencerBalance, aliceBalance, bananaPayBalance };
    };

    it('pay with bananacoin', async () => {
      const amount = 1;
      const nonce = 1;
      const messageHash = computeAuthWitMessageHash(
        bananaPay.address,
        bananas.methods.unshield(accounts[0].address, bananaPay.address, amount, nonce).request(),
      );
      await wallets[0].createAuthWitness(messageHash);

      // Fee asset
      {
        const { sequencerBalance, aliceBalance, bananaPayBalance } = await balances('⛽', gasTokenContract);
        expect(sequencerBalance).toEqual(0n);
        expect(aliceBalance).toEqual(1000n);
        expect(bananaPayBalance).toEqual(500n);
      }
      // Bananas asset
      {
        const { sequencerBalance, aliceBalance, bananaPayBalance } = await balances('🍌', bananas);
        expect(sequencerBalance).toEqual(0n);
        expect(aliceBalance).toEqual(0n);
        expect(bananaPayBalance).toEqual(0n);
      }

      await testContract.methods
        .mint_public(aliceAddress, 1000)
        .send({
          fee: {
            maxFee: 1,
            paymentMethod: new BananaFeePaymentMethod(bananaPay.address),
          },
        })
        .wait();

      // Fee asset
      {
        const { sequencerBalance, aliceBalance, bananaPayBalance } = await balances('⛽', gasTokenContract);
        expect(sequencerBalance).toEqual(1n);
        expect(aliceBalance).toEqual(1000n);
        expect(bananaPayBalance).toEqual(499n);
      }
      // Bananas asset
      {
        const { sequencerBalance, aliceBalance, bananaPayBalance } = await balances('🍌', bananas);
        expect(sequencerBalance).toEqual(0n);
        expect(aliceBalance).toEqual(0n);
        expect(bananaPayBalance).toEqual(1n);
      }
    });
  });
});

class BananaFeePaymentMethod implements FeePaymentMethod {
  constructor(public readonly bananaPay: AztecAddress) {}

  /**
   * Gets the native gas asset used to pay the fee.
   * @returns The asset used to pay the fee.
   */
  getAsset() {
    return this.bananaPay;
  }

  /**
   * The contract responsible for fee payment. This will be the same as the asset.
   * @returns The contract address responsible for holding the fee payment.
   */
  getPaymentContract() {
    return this.bananaPay;
  }

  /**
   * Fee payments in the native gas token are always public.
   * @returns false
   */
  isPrivateFeePayment(): boolean {
    return true;
  }

  /**
   * Creates a function call to pay the fee in gas token..
   * @param feeLimit - The maximum fee to be paid in gas token.
   * @returns A function call
   */
  getFunctionCalls(feeLimit: Fr): FunctionCall[] {
    return [
      {
        to: this.bananaPay,
        functionData: new FunctionData(
          FunctionSelector.fromSignature('pay_with_bananas(Field,Field)'),
          false,
          true,
          false,
        ),
        args: [feeLimit, new Fr(1)],
      },
    ];
  }
}
