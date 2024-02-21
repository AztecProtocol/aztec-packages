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
  Note,
  TxHash,
  computeAuthWitMessageHash,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { CompleteAddress, FunctionData } from '@aztec/circuits.js';
import { decodeFunctionSignature } from '@aztec/foundation/abi';
import { TokenContract as BananaCoin, BananaFPCContract, GasTokenContract } from '@aztec/noir-contracts.js';
import { getCanonicalGasToken } from '@aztec/protocol-contracts/gas-token';

import { setup } from './fixtures/utils.js';

const TOKEN_NAME = 'BananaCoin';
const TOKEN_SYMBOL = 'BAC';
const TOKEN_DECIMALS = 18n;

describe('e2e_fees', () => {
  let aliceAddress: AztecAddress;
  let sequencerAddress: AztecAddress;
  let gasTokenContract: GasTokenContract;
  let bananaCoin: BananaCoin;
  let bananaFPC: BananaFPCContract;

  let wallets: AccountWallet[];
  let wallet: AccountWallet;
  let accounts: CompleteAddress[];
  let aztecNode: AztecNode;
  let logger: DebugLogger;

  beforeAll(async () => {
    process.env.PXE_URL = '';
    ({ accounts, aztecNode, wallet, wallets, logger } = await setup(3));

    BananaCoin.artifact.functions.forEach(fn => {
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
    expect(gasTokenContract.address).toEqual(getCanonicalGasToken().address);

    aliceAddress = accounts.at(0)!.address;
    sequencerAddress = accounts.at(-1)!.address;
  }, 30_000);

  beforeEach(async () => {
    bananaCoin = await BananaCoin.deploy(wallets[0], accounts[0], TOKEN_NAME, TOKEN_SYMBOL, TOKEN_DECIMALS)
      .send()
      .deployed();

    logger(`BananaCoin deployed at ${bananaCoin.address}`);

    bananaFPC = await BananaFPCContract.deploy(wallets[0], bananaCoin.address, gasTokenContract.address)
      .send()
      .deployed();
    logger(`bananaPay deployed at ${bananaFPC.address}`);
  }, 100_000);

  it('mint banana privately, pay privately with banana via FPC', async () => {
    const InitialFPCGas = 500n;
    const PrivateInitialBananasAmount = 100n;
    const MintedBananasAmount = 1000n;
    const FeeAmount = 1n;

    await gasTokenContract.methods.redeem_bridged_balance(InitialFPCGas, bananaFPC.address).send().wait();

    // Fee asset
    {
      const { sequencerBalance, aliceBalance, fpcBalance } = await balances('⛽', gasTokenContract);
      expect(sequencerBalance).toEqual(0n);
      expect(aliceBalance).toEqual(0n);
      expect(fpcBalance).toEqual(InitialFPCGas);
    }

    // Mint bananas privately
    const secret = Fr.random();
    const secretHash = computeMessageSecretHash(secret);
    const receipt = await bananaCoin.methods.mint_private(PrivateInitialBananasAmount, secretHash).send().wait();

    // Setup auth wit
    await addPendingShieldNoteToPXE(0, PrivateInitialBananasAmount, secretHash, receipt.txHash);
    const txClaim = bananaCoin.methods.redeem_shield(accounts[0].address, PrivateInitialBananasAmount, secret).send();
    const receiptClaim = await txClaim.wait({ debug: true });
    const { visibleNotes } = receiptClaim.debugInfo!;
    expect(visibleNotes[0].note.items[0].toBigInt()).toBe(PrivateInitialBananasAmount);

    {
      // Sanity check. No public bananas yet.
      const { sequencerBalance, aliceBalance, fpcBalance } = await balances('🍌', bananaCoin);
      expect(sequencerBalance).toEqual(0n);
      expect(aliceBalance).toEqual(0n);
      expect(fpcBalance).toEqual(0n);
    }

    // set up auth wit for FPC for to unshield Alice's bananas to itself
    const nonce = 1;
    const messageHash = computeAuthWitMessageHash(
      bananaFPC.address,
      bananaCoin.methods.unshield(accounts[0].address, bananaFPC.address, FeeAmount, nonce).request(),
    );
    await wallets[0].createAuthWitness(messageHash);

    await bananaCoin.methods
      .mint_public(aliceAddress, MintedBananasAmount)
      .send({
        fee: {
          maxFee: FeeAmount,
          paymentMethod: new BananaFeePaymentMethod(bananaFPC.address),
        },
      })
      .wait();

    // Fee asset
    {
      const { sequencerBalance, aliceBalance, fpcBalance } = await balances('⛽', gasTokenContract);
      expect(sequencerBalance).toEqual(FeeAmount);
      expect(aliceBalance).toEqual(0n);
      expect(fpcBalance).toEqual(InitialFPCGas - FeeAmount);
    }
    // Bananas asset
    {
      const { sequencerBalance, aliceBalance, fpcBalance } = await balances('🍌', bananaCoin);
      expect(sequencerBalance).toEqual(0n);
      expect(aliceBalance).toEqual(MintedBananasAmount);
      expect(fpcBalance).toEqual(FeeAmount);
    }
  }, 100_000);

  const addPendingShieldNoteToPXE = async (accountIndex: number, amount: bigint, secretHash: Fr, txHash: TxHash) => {
    const storageSlot = new Fr(5); // The storage slot of `pending_shields` is 5.
    const noteTypeId = new Fr(84114971101151129711410111011678111116101n); // TransparentNote

    const note = new Note([new Fr(amount), secretHash]);
    const extendedNote = new ExtendedNote(
      note,
      accounts[accountIndex].address,
      bananaCoin.address,
      storageSlot,
      noteTypeId,
      txHash,
    );
    await wallets[accountIndex].addNote(extendedNote);
  };

  const balances = async (symbol: string, contract: Contract) => {
    const [sequencerBalance, aliceBalance, fpcBalance] = await Promise.all([
      contract.methods.balance_of_public(sequencerAddress).view(),
      contract.methods.balance_of_public(aliceAddress).view(),
      contract.methods.balance_of_public(bananaFPC.address).view(),
    ]);

    logger(`${symbol} balances: Alice ${aliceBalance}, bananaPay: ${fpcBalance}, sequencer: ${sequencerBalance}`);

    return { sequencerBalance, aliceBalance, fpcBalance };
  };
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
