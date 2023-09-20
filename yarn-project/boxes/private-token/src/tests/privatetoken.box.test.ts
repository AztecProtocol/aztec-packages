import {
  AccountWallet,
  AztecAddress,
  AztecRPC,
  CompleteAddress,
  Fr,
  TxStatus,
  Wallet,
  createAztecRpcClient,
  getSandboxAccountsWallets,
  waitForSandbox,
} from '@aztec/aztec.js';
import { FunctionSelector } from '@aztec/circuits.js';
import { FunctionAbi } from '@aztec/foundation/abi';

import { pedersenPlookupCompressWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { createDebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '../artifacts/token.js';
import { deployContract, getWallet } from '../scripts/index.js';
import { convertArgs } from '../scripts/util.js';
import { TokenSimulator } from './token_simulator.js';

const logger = createDebugLogger('aztec:http-rpc-client');
const hashPayload = async (payload: Fr[]) => {
  return pedersenPlookupCompressWithHashIndex(
    await CircuitsWasm.get(),
    payload.map(fr => fr.toBuffer()),
    GeneratorIndex.SIGNATURE_PAYLOAD,
  );
};

const TIMEOUT = 60_000;
const INITIAL_BALANCE = 444n;

// assumes sandbox is running locally, which this script does not trigger
// as well as anvil.  anvil can be started with yarn test:integration
const setupSandbox = async () => {
  const { SANDBOX_URL = 'http://localhost:8080' } = process.env;
  const aztecRpc = createAztecRpcClient(SANDBOX_URL);
  await waitForSandbox(aztecRpc);
  return aztecRpc;
};

const getFunctionAbi = (contractAbi: any, functionName: string) => {
  const functionAbi = contractAbi.functions.find((f: FunctionAbi) => f.name === functionName);
  if (!functionAbi) throw new Error(`Function ${functionName} not found in abi`);
  return functionAbi;
};

async function deployZKContract(owner: CompleteAddress, wallet: Wallet, rpcClient: AztecRPC) {
  logger('Deploying PrivateToken contract...');
  const constructorArgs = {
    // eslint-disable-next-line camelcase
    initial_supply: INITIAL_BALANCE,
    owner: owner.address,
  };
  const constructorAbi = getFunctionAbi(TokenContract.abi, 'constructor');
  const typedArgs = convertArgs(constructorAbi, constructorArgs);

  const contractAddress = await deployContract(owner, TokenContract.abi, typedArgs, Fr.random(), rpcClient);

  logger(`L2 contract deployed at ${contractAddress}`);
  const contract = await TokenContract.at(contractAddress, wallet);
  return contract;
}

describe('Token Contract Tests', () => {
  jest.setTimeout(TIMEOUT);
  let wallets: AccountWallet[];
  let ownerWallet: AccountWallet;
  let owner: CompleteAddress;
  let account2: CompleteAddress;
  let account3: CompleteAddress;
  let asset: TokenContract;

  let contractAddress: AztecAddress;
  let rpcClient: AztecRPC;

  let tokenSim: TokenSimulator;

  beforeAll(async () => {
    rpcClient = await setupSandbox();
    const accounts = await rpcClient.getRegisteredAccounts();
    [owner, account2, account3] = accounts;
    wallets = await getSandboxAccountsWallets(rpcClient);

    ownerWallet = await getWallet(owner, rpcClient);

    asset = await deployZKContract(owner, ownerWallet, rpcClient);
    logger(`Token deployed to ${asset.address}`);
    contractAddress = asset.address;
    tokenSim = new TokenSimulator(
      asset,
      logger,
      accounts.map(a => a.address),
    );

    await asset.methods._initialize({ address: owner.address }).send().wait();
    expect(await asset.methods.admin().view()).toBe(owner.address.toBigInt());

    asset.abi.functions.forEach(fn => {
      logger(`Function ${fn.name} has ${fn.bytecode.length} bytes`);
    });
  }, 100_000);

  afterEach(async () => {
    await tokenSim.check();
  }, TIMEOUT);

  describe('Access controlled functions', () => {
    it('Set admin', async () => {
      const tx = asset.methods.set_admin({ address: account2.address }).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.admin().view()).toBe(account2.address.toBigInt());
    });

    it('Add minter as admin', async () => {
      const tx = asset.withWallet(wallets[1]).methods.set_minter({ address: account2.address }, true).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter({ address: account2.address }).view()).toBe(true);
    });

    it('Revoke minter as admin', async () => {
      const tx = asset.withWallet(wallets[1]).methods.set_minter({ address: account2.address }, false).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter({ address: account2.address }).view()).toBe(false);
    });

    describe('failure cases', () => {
      it('Set admin (not admin)', async () => {
        await expect(asset.methods.set_admin({ address: owner.address }).simulate()).rejects.toThrowError(
          'Assertion failed: caller is not admin',
        );
      });
      it('Revoke minter not as admin', async () => {
        await expect(asset.methods.set_minter({ address: owner.address }, false).simulate()).rejects.toThrowError(
          'Assertion failed: caller is not admin',
        );
      });
    });
  });

  describe('Minting', () => {
    describe('Public', () => {
      it('as minter', async () => {
        const amount = 10000n;
        const tx = asset.methods.mint_public({ address: owner.address }, amount).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.mintPublic(owner.address, amount);
        expect(await asset.methods.balance_of_public({ address: owner.address }).view()).toEqual(
          tokenSim.balanceOfPublic(owner.address),
        );
        expect(await asset.methods.total_supply().view()).toEqual(tokenSim.totalSupply);
      });

      describe('failure cases', () => {
        it('as non-minter', async () => {
          const amount = 10000n;
          await expect(
            asset.withWallet(wallets[1]).methods.mint_public({ address: owner.address }, amount).simulate(),
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(asset.methods.mint_public({ address: owner.address }, amount).simulate()).rejects.toThrowError(
            'Assertion failed: Value too large for SafeU120',
          );
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(owner.address);
          await expect(asset.methods.mint_public({ address: owner.address }, amount).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(owner.address);
          await expect(
            asset.methods.mint_public({ address: account2.address }, amount).simulate(),
          ).rejects.toThrowError('Assertion failed: Overflow');
        });
      });
    });

    describe('Private', () => {
      const secret = Fr.random();
      const amount = 10000n;
      let secretHash: Fr;

      beforeAll(async () => {
        secretHash = await computeMessageSecretHash(secret);
      });

      describe('Mint flow', () => {
        it('mint_private as minter', async () => {
          const tx = asset.methods.mint_private(amount, secretHash).send();
          const receipt = await tx.wait();
          expect(receipt.status).toBe(TxStatus.MINED);
          tokenSim.mintPrivate(amount);
        });

        it('redeem as recipient', async () => {
          const txClaim = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
          const receiptClaim = await txClaim.wait();
          expect(receiptClaim.status).toBe(TxStatus.MINED);
          tokenSim.redeemShield(owner.address, amount);
        });
      });

      describe('failure cases', () => {
        it('try to redeem as recipient (double-spend) [REVERTS]', async () => {
          const txClaim = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
          await txClaim.isMined();
          const receipt = await txClaim.getReceipt();
          expect(receipt.status).toBe(TxStatus.DROPPED);
        });

        it('mint_private as non-minter', async () => {
          await expect(
            asset.withWallet(wallets[1]).methods.mint_private(amount, secretHash).simulate(),
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Value too large for SafeU120',
          );
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPrivate(owner.address);
          expect(amount).toBeLessThan(2n ** 120n);
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.totalSupply;
          await expect(asset.methods.mint_private(amount, secretHash).simulate()).rejects.toThrowError(
            'Assertion failed: Overflow',
          );
        });
      });
    });
  });

  describe('Transfer', () => {
    describe('public', () => {
      const transferMessageHash = async (
        caller: CompleteAddress,
        from: CompleteAddress,
        to: CompleteAddress,
        amount: bigint,
        nonce: Fr,
      ) => {
        return await hashPayload([
          caller.address.toField(),
          asset.address.toField(),
          FunctionSelector.fromSignature('transfer_public((Field),(Field),Field,Field)').toField(),
          from.address.toField(),
          to.address.toField(),
          new Fr(amount),
          nonce,
        ]);
      };

      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer_public({ address: owner.address }, { address: account2.address }, amount, 0)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.transferPublic(owner.address, account2.address, amount);
      });

      it('transfer to self', async () => {
        const balance = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer_public({ address: owner.address }, { address: owner.address }, amount, 0)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.transferPublic(owner.address, owner.address, amount);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const nonce = Fr.random();

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        // Perform the transfer
        const tx = asset
          .withWallet(wallets[1])
          .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.transferPublic(owner.address, account2.address, amount);

        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
          .send();
        await txReplay.isMined();
        const receiptReplay = await txReplay.getReceipt();
        expect(receiptReplay.status).toBe(TxStatus.DROPPED);
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(
            asset.methods
              .transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 - 1n;
          const nonce = 1;
          await expect(
            asset.methods
              .transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: invalid nonce');
        });

        it('transfer on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const balance1 = await asset.methods.balance_of_public({ address: account2.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Underflow');

          expect(await asset.methods.balance_of_public({ address: owner.address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public({ address: account2.address }).view()).toEqual(balance1);
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const balance1 = await asset.methods.balance_of_public({ address: account2.address }).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(owner, owner, account2, amount, nonce);
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');

          expect(await asset.methods.balance_of_public({ address: owner.address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public({ address: account2.address }).view()).toEqual(balance1);
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const balance1 = await asset.methods.balance_of_public({ address: account2.address }).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(owner, owner, account2, amount, nonce);
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          // Perform the transfer
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer_public({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');

          expect(await asset.methods.balance_of_public({ address: owner.address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public({ address: account2.address }).view()).toEqual(balance1);
        });

        it.skip('transfer into account to overflow', () => {
          // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
          // a way to get funds enough to overflow.
          // Require direct storage manipulation for us to perform a nice explicit case though.
          // See https://github.com/AztecProtocol/aztec-packages/issues/1259
        });
      });
    });

    describe('private', () => {
      const transferMessageHash = async (
        caller: CompleteAddress,
        from: CompleteAddress,
        to: CompleteAddress,
        amount: bigint,
        nonce: Fr,
      ) => {
        return await hashPayload([
          caller.address.toField(),
          asset.address.toField(),
          FunctionSelector.fromSignature('transfer((Field),(Field),Field,Field)').toField(),
          from.address.toField(),
          to.address.toField(),
          new Fr(amount),
          nonce,
        ]);
      };

      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.transfer({ address: owner.address }, { address: account2.address }, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(owner.address, account2.address, amount);
      });

      it('transfer to self', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.transfer({ address: owner.address }, { address: owner.address }, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(owner.address, owner.address, amount);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);

        // Perform the transfer
        const tx = asset
          .withWallet(wallets[1])
          .methods.transfer({ address: owner.address }, { address: account2.address }, amount, nonce)
          .send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.transferPrivate(owner.address, account2.address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.transfer({ address: owner.address }, { address: account2.address }, amount, nonce)
          .send();
        await txReplay.isMined();
        const receiptReplay = await txReplay.getReceipt();
        expect(receiptReplay.status).toBe(TxStatus.DROPPED);
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer({ address: owner.address }, { address: account2.address }, amount, 0).simulate(),
          ).rejects.toThrowError('Assertion failed: Balance too low');
        });

        it('transfer on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods.transfer({ address: owner.address }, { address: account2.address }, amount, 1).simulate(),
          ).rejects.toThrowError('Assertion failed: invalid nonce');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const balance1 = await asset.methods.balance_of_private({ address: account2.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);

          // Both wallets are connected to same node and rpc so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, );
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[1].addAuthWitness(witness);

          // Perform the transfer
          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError('Assertion failed: Balance too low');
          expect(await asset.methods.balance_of_private({ address: owner.address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_private({ address: account2.address }).view()).toEqual(balance1);
        });

        it.skip('transfer into account to overflow', () => {
          // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
          // a way to get funds enough to overflow.
          // Require direct storage manipulation for us to perform a nice explicit case though.
          // See https://github.com/AztecProtocol/aztec-packages/issues/1259
        });

        it('transfer on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);

          await expect(
            asset
              .withWallet(wallets[1])
              .methods.transfer({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError(`Unknown auth witness for message hash 0x${messageHash.toString('hex')}`);
        });

        it('transfer on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await transferMessageHash(account2, owner, account2, amount, nonce);
          const expectedMessageHash = await transferMessageHash(account3, owner, account2, amount, nonce);

          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[2].addAuthWitness(witness);

          await expect(
            asset
              .withWallet(wallets[2])
              .methods.transfer({ address: owner.address }, { address: account2.address }, amount, nonce)
              .simulate(),
          ).rejects.toThrowError(`Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`);
          expect(await asset.methods.balance_of_private({ address: owner.address }).view()).toEqual(balance0);
        });
      });
    });
  });

  describe('Shielding (shield + redeem_shield)', () => {
    const secret = Fr.random();
    let secretHash: Fr;

    beforeAll(async () => {
      secretHash = await computeMessageSecretHash(secret);
    });

    const shieldMessageHash = async (
      caller: CompleteAddress,
      from: CompleteAddress,
      amount: bigint,
      secretHash: Fr,
      nonce: Fr,
    ) => {
      return await hashPayload([
        caller.address.toField(),
        asset.address.toField(),
        FunctionSelector.fromSignature('shield((Field),Field,Field,Field)').toField(),
        from.address.toField(),
        new Fr(amount),
        secretHash,
        nonce,
      ]);
    };

    it('on behalf of self', async () => {
      const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
      const amount = balancePub / 2n;
      expect(amount).toBeGreaterThan(0n);

      const tx = asset.methods.shield({ address: owner.address }, amount, secretHash, 0).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.shield(owner.address, amount);
      await tokenSim.check();

      // Redeem it
      const txClaim = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);

      tokenSim.redeemShield(owner.address, amount);

      // Check that claiming again will hit a double-spend and fail due to pending note already consumed.
      const txClaimDoubleSpend = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
      await txClaimDoubleSpend.isMined();
      const receiptDoubleSpend = await txClaimDoubleSpend.getReceipt();
      expect(receiptDoubleSpend.status).toBe(TxStatus.DROPPED);
    });

    it('on behalf of other', async () => {
      const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
      const amount = balancePub / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const messageHash = await shieldMessageHash(account2, owner, amount, secretHash, nonce);
      await wallets[0].setPublicAuth(messageHash, true).send().wait();

      const tx = asset
        .withWallet(wallets[1])
        .methods.shield({ address: owner.address }, amount, secretHash, nonce)
        .send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.shield(owner.address, amount);
      await tokenSim.check();

      // Check that replaying the shield should fail!
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.shield({ address: owner.address }, amount, secretHash, nonce)
        .send();
      await txReplay.isMined();
      const receiptReplay = await txReplay.getReceipt();
      expect(receiptReplay.status).toBe(TxStatus.DROPPED);

      // Redeem it
      const txClaim = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);

      tokenSim.redeemShield(owner.address, amount);

      // Check that claiming again will hit a double-spend and fail due to pending note already consumed.
      const txClaimDoubleSpend = asset.methods.redeem_shield({ address: owner.address }, amount, secret).send();
      await txClaimDoubleSpend.isMined();
      const receiptDoubleSpend = await txClaimDoubleSpend.getReceipt();
      expect(receiptDoubleSpend.status).toBe(TxStatus.DROPPED);
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.shield({ address: owner.address }, amount, secretHash, 0).simulate(),
        ).rejects.toThrowError('Assertion failed: Underflow');
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.shield({ address: owner.address }, amount, secretHash, 1).simulate(),
        ).rejects.toThrowError('Assertion failed: invalid nonce');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await shieldMessageHash(account2, owner, amount, secretHash, nonce);
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        await expect(
          asset.withWallet(wallets[1]).methods.shield({ address: owner.address }, amount, secretHash, nonce).simulate(),
        ).rejects.toThrowError('Assertion failed: Underflow');
      });

      it('on behalf of other (wrong designated caller)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await shieldMessageHash(account2, owner, amount, secretHash, nonce);
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        await expect(
          asset.withWallet(wallets[2]).methods.shield({ address: owner.address }, amount, secretHash, nonce).simulate(),
        ).rejects.toThrowError('Assertion failed: Message not authorized by account');
      });

      it('on behalf of other (wrong designated caller)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: owner.address }).view();
        const balancePriv = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePub + 1n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await shieldMessageHash(account2, owner, amount, secretHash, nonce);
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        await expect(
          asset.withWallet(wallets[2]).methods.shield({ address: owner.address }, amount, secretHash, nonce).simulate(),
        ).rejects.toThrowError('Assertion failed: Message not authorized by account');

        expect(await asset.methods.balance_of_public({ address: owner.address }).view()).toEqual(balancePub);
        expect(await asset.methods.balance_of_private({ address: owner.address }).view()).toEqual(balancePriv);
      });

      it('on behalf of other (without approval)', async () => {
        const balance = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.withWallet(wallets[1]).methods.shield({ address: owner.address }, amount, secretHash, nonce).simulate(),
        ).rejects.toThrowError(`Assertion failed: Message not authorized by account`);
      });
    });
  });

  describe('Unshielding', () => {
    const unshieldMessageHash = async (
      caller: CompleteAddress,
      from: CompleteAddress,
      to: CompleteAddress,
      amount: bigint,
      nonce: Fr,
    ) => {
      return await hashPayload([
        caller.address.toField(),
        asset.address.toField(),
        FunctionSelector.fromSignature('unshield((Field),(Field),Field,Field)').toField(),
        from.address.toField(),
        to.address.toField(),
        new Fr(amount),
        nonce,
      ]);
    };

    it('on behalf of self', async () => {
      const balancePriv = await asset.methods.balance_of_private({ address: owner.address }).view();
      const amount = balancePriv / 2n;
      expect(amount).toBeGreaterThan(0n);

      const tx = asset.methods.unshield({ address: owner.address }, { address: owner.address }, amount, 0).send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      tokenSim.unshield(owner.address, owner.address, amount);
    });

    it('on behalf of other', async () => {
      const balancePriv0 = await asset.methods.balance_of_private({ address: owner.address }).view();
      const amount = balancePriv0 / 2n;
      const nonce = Fr.random();
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign and add it to the wallet as approved
      const messageHash = await unshieldMessageHash(account2, owner, account2, amount, nonce);

      // Both wallets are connected to same node and rpc so we could just insert directly using
      // await wallet.signAndAddAuthWitness(messageHash, );
      // But doing it in two actions to show the flow.
      const witness = await wallets[0].createAuthWitness(messageHash);
      await wallets[1].addAuthWitness(witness);

      const tx = asset
        .withWallet(wallets[1])
        .methods.unshield({ address: owner.address }, { address: account2.address }, amount, nonce)
        .send();
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      tokenSim.unshield(owner.address, account2.address, amount);

      // Perform the transfer again, should fail
      const txReplay = asset
        .withWallet(wallets[1])
        .methods.unshield({ address: owner.address }, { address: account2.address }, amount, nonce)
        .send();
      await txReplay.isMined();
      const receiptReplay = await txReplay.getReceipt();
      expect(receiptReplay.status).toBe(TxStatus.DROPPED);
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePriv = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield({ address: owner.address }, { address: owner.address }, amount, 0).simulate(),
        ).rejects.toThrowError('Assertion failed: Balance too low');
      });

      it('on behalf of self (invalid nonce)', async () => {
        const balancePriv = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods.unshield({ address: owner.address }, { address: owner.address }, amount, 1).simulate(),
        ).rejects.toThrowError('Assertion failed: invalid nonce');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await unshieldMessageHash(account2, owner, account2, amount, nonce);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);

        await expect(
          asset
            .withWallet(wallets[1])
            .methods.unshield({ address: owner.address }, { address: account2.address }, amount, nonce)
            .simulate(),
        ).rejects.toThrowError('Assertion failed: Balance too low');
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await unshieldMessageHash(account2, owner, account2, amount, nonce);
        const expectedMessageHash = await unshieldMessageHash(account3, owner, account2, amount, nonce);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[2].addAuthWitness(witness);

        await expect(
          asset
            .withWallet(wallets[2])
            .methods.unshield({ address: owner.address }, { address: account2.address }, amount, nonce)
            .simulate(),
        ).rejects.toThrowError(`Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`);
      });
    });
  });

  describe('Burn', () => {
    describe('public', () => {
      const burnMessageHash = async (caller: CompleteAddress, from: CompleteAddress, amount: bigint, nonce: Fr) => {
        return await hashPayload([
          caller.address.toField(),
          asset.address.toField(),
          FunctionSelector.fromSignature('burn_public((Field),Field,Field)').toField(),
          from.address.toField(),
          new Fr(amount),
          nonce,
        ]);
      };

      it('burn less than balance', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.burn_public({ address: owner.address }, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.burnPublic(owner.address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const nonce = Fr.random();

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await burnMessageHash(account2, owner, amount, nonce);
        await wallets[0].setPublicAuth(messageHash, true).send().wait();

        const tx = asset.withWallet(wallets[1]).methods.burn_public({ address: owner.address }, amount, nonce).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.burnPublic(owner.address, amount);

        // Check that the message hash is no longer valid. Need to try to send since nullifiers are handled by sequencer.
        const txReplay = asset
          .withWallet(wallets[1])
          .methods.burn_public({ address: owner.address }, amount, nonce)
          .send();
        await txReplay.isMined();
        const receiptReplay = await txReplay.getReceipt();
        expect(receiptReplay.status).toBe(TxStatus.DROPPED);
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = 0;
          await expect(
            asset.methods.burn_public({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          const nonce = 1;
          await expect(
            asset.methods.burn_public({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: invalid nonce');
        });

        it('burn on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          await expect(
            asset.withWallet(wallets[1]).methods.burn_public({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
        });

        it('burn more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await burnMessageHash(account2, owner, amount, nonce);
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          await expect(
            asset.withWallet(wallets[1]).methods.burn_public({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('burn on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: owner.address }).view();
          const amount = balance0 + 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await burnMessageHash(owner, owner, amount, nonce);
          await wallets[0].setPublicAuth(messageHash, true).send().wait();

          await expect(
            asset.withWallet(wallets[1]).methods.burn_public({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Message not authorized by account');
        });
      });
    });

    describe('private', () => {
      const burnMessageHash = async (caller: CompleteAddress, from: CompleteAddress, amount: bigint, nonce: Fr) => {
        return await hashPayload([
          caller.address.toField(),
          asset.address.toField(),
          FunctionSelector.fromSignature('burn((Field),Field,Field)').toField(),
          from.address.toField(),
          new Fr(amount),
          nonce,
        ]);
      };

      it('burn less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods.burn({ address: owner.address }, amount, 0).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.burnPrivate(owner.address, amount);
      });

      it('burn on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balance0 / 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await burnMessageHash(account2, owner, amount, nonce);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, );
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[1].addAuthWitness(witness);

        const tx = asset.withWallet(wallets[1]).methods.burn({ address: owner.address }, amount, nonce).send();
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        tokenSim.burnPrivate(owner.address, amount);

        // Perform the transfer again, should fail
        const txReplay = asset.withWallet(wallets[1]).methods.burn({ address: owner.address }, amount, nonce).send();
        await txReplay.isMined();
        const receiptReplay = await txReplay.getReceipt();
        expect(receiptReplay.status).toBe(TxStatus.DROPPED);
      });

      describe('failure cases', () => {
        it('burn more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn({ address: owner.address }, amount, 0).simulate()).rejects.toThrowError(
            'Assertion failed: Balance too low',
          );
        });

        it('burn on behalf of self with non-zero nonce', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 - 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(asset.methods.burn({ address: owner.address }, amount, 1).simulate()).rejects.toThrowError(
            'Assertion failed: invalid nonce',
          );
        });

        it('burn more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 + 1n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await burnMessageHash(account2, owner, amount, nonce);

          // Both wallets are connected to same node and rpc so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, );
          // But doing it in two actions to show the flow.
          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[1].addAuthWitness(witness);

          await expect(
            asset.withWallet(wallets[1]).methods.burn({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError('Assertion failed: Balance too low');
        });

        it('burn on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await burnMessageHash(account2, owner, amount, nonce);

          await expect(
            asset.withWallet(wallets[1]).methods.burn({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError(`Unknown auth witness for message hash 0x${messageHash.toString('hex')}`);
        });

        it('burn on behalf of other, wrong designated caller', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: owner.address }).view();
          const amount = balance0 / 2n;
          const nonce = Fr.random();
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign and add it to the wallet as approved
          const messageHash = await burnMessageHash(account2, owner, amount, nonce);
          const expectedMessageHash = await burnMessageHash(account3, owner, amount, nonce);

          const witness = await wallets[0].createAuthWitness(messageHash);
          await wallets[2].addAuthWitness(witness);

          await expect(
            asset.withWallet(wallets[2]).methods.burn({ address: owner.address }, amount, nonce).simulate(),
          ).rejects.toThrowError(`Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`);
        });
      });

      it('on behalf of other (invalid designated caller)', async () => {
        const balancePriv0 = await asset.methods.balance_of_private({ address: owner.address }).view();
        const amount = balancePriv0 + 2n;
        const nonce = Fr.random();
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign and add it to the wallet as approved
        const messageHash = await burnMessageHash(account2, owner, amount, nonce);
        const expectedMessageHash = await burnMessageHash(account3, owner, amount, nonce);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, { origin: owner.address });
        // But doing it in two actions to show the flow.
        const witness = await wallets[0].createAuthWitness(messageHash);
        await wallets[2].addAuthWitness(witness);

        await expect(
          asset.withWallet(wallets[2]).methods.burn({ address: owner.address }, amount, nonce).simulate(),
        ).rejects.toThrowError(`Unknown auth witness for message hash 0x${expectedMessageHash.toString('hex')}`);
      });
    });
  });
});
