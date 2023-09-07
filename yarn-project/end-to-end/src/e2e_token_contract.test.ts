import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import {
  Account,
  AuthEntrypointCollection,
  AuthWitnessAccountContract,
  AuthWitnessEntrypointWallet,
  AztecAddress,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { CircuitsWasm, CompleteAddress, Fr, FunctionSelector, GeneratorIndex, PrivateKey } from '@aztec/circuits.js';
import { pedersenPlookupCompressWithHashIndex } from '@aztec/circuits.js/barretenberg';
import { DebugLogger } from '@aztec/foundation/log';
import { SchnorrAuthWitnessAccountContract, TokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import { rpc } from 'viem/utils';

import { setup } from './fixtures/utils.js';

const hashPayload = async (payload: Fr[]) => {
  return pedersenPlookupCompressWithHashIndex(
    await CircuitsWasm.get(),
    payload.map(fr => fr.toBuffer()),
    GeneratorIndex.SIGNATURE_PAYLOAD,
  );
};
class TokenSimulator {
  private balances: Map<AztecAddress, bigint> = new Map();
  private balanceOf: Map<AztecAddress, bigint> = new Map();
  public totalSupply: bigint = 0n;

  constructor() {}

  public mintPrivate(to: AztecAddress, amount: bigint) {
    this.totalSupply += amount;
    const value = this.balances.get(to) || 0n;
    this.balances.set(to, value + amount);
  }

  public mintPublic(to: AztecAddress, amount: bigint) {
    this.totalSupply += amount;
    const value = this.balanceOf.get(to) || 0n;
    this.balanceOf.set(to, value + amount);
  }

  public balanceOfPublic(address: AztecAddress) {
    return this.balanceOf.get(address) || 0n;
  }

  public balanceOfPrivate(address: AztecAddress) {
    return this.balances.get(address) || 0n;
  }
}

describe('e2e_token_contract', () => {
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let wallet: AuthWitnessEntrypointWallet;
  let accounts: CompleteAddress[];
  let logger: DebugLogger;

  let asset: TokenContract;

  const tokenSim = new TokenSimulator();

  beforeAll(async () => {
    ({ aztecNode, aztecRpcServer, logger } = await setup(0));

    {
      const _accounts = [];
      for (let i = 0; i < 2; i++) {
        const privateKey = PrivateKey.random();
        const account = new Account(aztecRpcServer, privateKey, new AuthWitnessAccountContract(privateKey));
        const deployTx = await account.deploy();
        await deployTx.wait({ interval: 0.1 });
        _accounts.push(account);
      }
      wallet = new AuthWitnessEntrypointWallet(aztecRpcServer, await AuthEntrypointCollection.fromAccounts(_accounts));
      accounts = await wallet.getAccounts();
    }

    {
      logger(`Deploying token contract`);
      const tx = TokenContract.deploy(wallet).send();
      logger(`Tx sent with hash ${await tx.getTxHash()}`);
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      logger(`Token deployed to ${receipt.contractAddress}`);
      asset = await TokenContract.at(receipt.contractAddress!, wallet);
    }

    {
      const initializeTx = asset.methods
        ._initialize({ address: accounts[0].address })
        .send({ origin: accounts[0].address });
      const receipt = await initializeTx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.admin().view()).toBe(accounts[0].address.toBigInt());
    }

    asset.abi.functions.forEach(fn => {
      logger(
        `Function ${fn.name} has ${fn.bytecode.length} bytes and the selector: ${FunctionSelector.fromNameAndParameters(
          fn.name,
          fn.parameters,
        )}`,
      );
    });
  }, 100_000);

  afterAll(async () => {
    await aztecNode?.stop();
    if (aztecRpcServer instanceof AztecRPCServer) {
      await aztecRpcServer?.stop();
    }
  });

  describe('Access controlled functions', () => {
    it('Set admin', async () => {
      const tx = asset.methods.set_admin({ address: accounts[1].address }).send({ origin: accounts[0].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.admin().view()).toBe(accounts[1].address.toBigInt());
    });

    it('Add minter as admin', async () => {
      const tx = asset.methods.set_minter({ address: accounts[1].address }, 1).send({ origin: accounts[1].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter({ address: accounts[1].address }).view()).toBe(true);
    });

    it('Revoke minter as admin', async () => {
      const tx = asset.methods.set_minter({ address: accounts[1].address }, 0).send({ origin: accounts[1].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);
      expect(await asset.methods.is_minter({ address: accounts[1].address }).view()).toBe(false);
    });

    describe('failure cases', () => {
      it('Set admin (not admin)', async () => {
        await expect(
          asset.methods.set_admin({ address: accounts[0].address }).simulate({ origin: accounts[0].address }),
        ).rejects.toThrowError('Assertion failed: caller is not admin');
      });
      it('Revoke minter not as admin', async () => {
        await expect(
          asset.methods.set_minter({ address: accounts[0].address }, 0).simulate({ origin: accounts[0].address }),
        ).rejects.toThrowError('Assertion failed: caller is not admin');
      });
    });
  });

  describe('Minting', () => {
    describe('Public', () => {
      it('as minter', async () => {
        const amount = 10000n;
        const tx = asset.methods
          .mint_pub({ address: accounts[0].address }, amount)
          .send({ origin: accounts[0].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        tokenSim.mintPublic(accounts[0].address, amount);

        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
          tokenSim.balanceOfPublic(accounts[0].address),
        );
        expect(await asset.methods.total_supply().view()).toEqual(tokenSim.totalSupply);
      });

      describe('failure cases', () => {
        it('as non-minter', async () => {
          const amount = 10000n;
          await expect(
            asset.methods.mint_pub({ address: accounts[0].address }, amount).simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(
            asset.methods.mint_pub({ address: accounts[0].address }, amount).simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Value too large for SafeU120');
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(
            asset.methods.mint_pub({ address: accounts[0].address }, amount).simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Overflow');
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPublic(accounts[0].address);
          await expect(
            asset.methods.mint_pub({ address: accounts[1].address }, amount).simulate({ origin: accounts[0].address }),
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
          const tx = asset.methods.mint_priv(amount, secretHash).send({ origin: accounts[0].address });
          const receipt = await tx.wait();
          expect(receipt.status).toBe(TxStatus.MINED);
          tokenSim.mintPrivate(accounts[0].address, amount);
          expect(await asset.methods.total_supply().view()).toEqual(tokenSim.totalSupply);
          expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(0n);
        });

        it('redeem as recipient', async () => {
          const txClaim = asset.methods
            .redeem_shield({ address: accounts[0].address }, amount, secret)
            .send({ origin: accounts[0].address });
          const receiptClaim = await txClaim.wait();
          expect(receiptClaim.status).toBe(TxStatus.MINED);
          expect(await asset.methods.total_supply().view()).toEqual(tokenSim.totalSupply);
          expect(
            await asset.methods
              .balance_of_private({ address: accounts[0].address })
              .view({ from: accounts[0].address }),
          ).toEqual(amount);
        });
      });

      describe('failure cases', () => {
        it('try to redeem as recipient (double-spend) [REVERTS]', async () => {
          const txClaim = asset.methods
            .redeem_shield({ address: accounts[0].address }, amount, secret)
            .send({ origin: accounts[0].address });
          await txClaim.isMined();
          const receipt = await txClaim.getReceipt();
          expect(receipt.status).toBe(TxStatus.DROPPED);
        });

        it('mint_private as non-minter', async () => {
          await expect(
            asset.methods.mint_priv(amount, secretHash).simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError('Assertion failed: caller is not minter');
        });

        it('mint >u120 tokens to overflow', async () => {
          const amount = 2n ** 120n; // SafeU120::max() + 1;
          await expect(
            asset.methods.mint_priv(amount, secretHash).simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Value too large for SafeU120');
        });

        it('mint <u120 but recipient balance >u120', async () => {
          const amount = 2n ** 120n - tokenSim.balanceOfPrivate(accounts[0].address);
          await expect(
            asset.methods.mint_priv(amount, secretHash).simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Overflow');
        });

        it('mint <u120 but such that total supply >u120', async () => {
          const amount = 2n ** 120n - tokenSim.totalSupply;
          await expect(
            asset.methods.mint_priv(amount, secretHash).simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Overflow');
        });
      });
    });
  });

  describe('Transfer', () => {
    describe('public', () => {
      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer_public({ address: accounts[0].address }, { address: accounts[1].address }, amount)
          .send({ origin: accounts[0].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
          balance0 - amount,
        );
        expect(await asset.methods.balance_of_public({ address: accounts[1].address }).view()).toEqual(amount);
      });

      it('transfer to self', async () => {
        const balance = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const amount = balance / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer_public({ address: accounts[0].address }, { address: accounts[0].address }, amount)
          .send({ origin: accounts[0].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(balance);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const balance1 = await asset.methods.balance_of_public({ address: accounts[1].address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign.
        const messageHash = await hashPayload([
          FunctionSelector.fromSignature('transfer_public((Field),(Field),Field)').toField(),
          accounts[0].address.toField(),
          accounts[1].address.toField(),
          new Fr(amount),
        ]);

        // Add it to the wallet as approved
        const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
        const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
        const validTxReceipt = await setValidTx.wait();
        expect(validTxReceipt.status).toBe(TxStatus.MINED);

        // Perform the transfer
        const tx = asset.methods
          .transfer_public({ address: accounts[0].address }, { address: accounts[1].address }, amount)
          .send({ origin: accounts[1].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
          balance0 - amount,
        );
        expect(await asset.methods.balance_of_public({ address: accounts[1].address }).view()).toEqual(
          balance1 + amount,
        );
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
          const amount = balance0 + 1n;
          await expect(
            asset.methods
              .transfer_public({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Underflow');
        });

        it('transfer on behalf of other without "approval"', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
          const amount = balance0 + 1n;
          await expect(
            asset.methods
              .transfer_public({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError('Assertion failed: invalid call');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
          const balance1 = await asset.methods.balance_of_public({ address: accounts[1].address }).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign.
          const messageHash = await hashPayload([
            FunctionSelector.fromSignature('transfer_public((Field),(Field),Field)').toField(),
            accounts[0].address.toField(),
            accounts[1].address.toField(),
            new Fr(amount),
          ]);

          // Add it to the wallet as approved
          const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
          const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
          const validTxReceipt = await setValidTx.wait();
          expect(validTxReceipt.status).toBe(TxStatus.MINED);

          // Perform the transfer
          await expect(
            asset.methods
              .transfer_public({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError('Assertion failed: Underflow');

          expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_public({ address: accounts[1].address }).view()).toEqual(balance1);
        });

        it.skip('transfer into account to overflow', () => {
          // This should already be covered by the mint case earlier. e.g., since we cannot mint to overflow, there is not
          // a way to get funds enough to overflow.
        });
      });
    });

    describe('private', () => {
      it('transfer less than balance', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer({ address: accounts[0].address }, { address: accounts[1].address }, amount)
          .send({ origin: accounts[0].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
          balance0 - amount,
        );
        expect(await asset.methods.balance_of_private({ address: accounts[1].address }).view()).toEqual(amount);
      });

      it('transfer to self', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);
        const tx = asset.methods
          .transfer({ address: accounts[0].address }, { address: accounts[0].address }, amount)
          .send({ origin: accounts[0].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);
        expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balance0);
      });

      it('transfer on behalf of other', async () => {
        const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const balance1 = await asset.methods.balance_of_private({ address: accounts[1].address }).view();
        const amount = balance0 / 2n;
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign.
        const messageHash = await hashPayload([
          FunctionSelector.fromSignature('transfer((Field),(Field),Field)').toField(),
          accounts[0].address.toField(),
          accounts[1].address.toField(),
          new Fr(amount),
        ]);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, { origin: accounts[0].address });
        // But doing it in two actions to show the flow.
        const witness = await wallet.signAndGetAuthWitness(messageHash, { origin: accounts[0].address });
        await wallet.addAuthWitness(Fr.fromBuffer(messageHash), witness);

        // Perform the transfer
        const tx = asset.methods
          .transfer({ address: accounts[0].address }, { address: accounts[1].address }, amount)
          .send({ origin: accounts[1].address });
        const receipt = await tx.wait();
        expect(receipt.status).toBe(TxStatus.MINED);

        expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
          balance0 - amount,
        );
        expect(await asset.methods.balance_of_private({ address: accounts[1].address }).view()).toEqual(
          balance1 + amount,
        );
      });

      describe('failure cases', () => {
        it('transfer more than balance', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);
          await expect(
            asset.methods
              .transfer({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[0].address }),
          ).rejects.toThrowError('Assertion failed: Balance too low');
        });

        it('transfer more than balance on behalf of other', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
          const balance1 = await asset.methods.balance_of_private({ address: accounts[1].address }).view();
          const amount = balance0 + 1n;
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign.
          const messageHash = await hashPayload([
            FunctionSelector.fromSignature('transfer((Field),(Field),Field)').toField(),
            accounts[0].address.toField(),
            accounts[1].address.toField(),
            new Fr(amount),
          ]);

          // Both wallets are connected to same node and rpc so we could just insert directly using
          // await wallet.signAndAddAuthWitness(messageHash, { origin: accounts[0].address });
          // But doing it in two actions to show the flow.
          const witness = await wallet.signAndGetAuthWitness(messageHash, { origin: accounts[0].address });
          await wallet.addAuthWitness(Fr.fromBuffer(messageHash), witness);

          // Perform the transfer
          await expect(
            asset.methods
              .transfer({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError('Assertion failed: Balance too low');
          expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balance0);
          expect(await asset.methods.balance_of_private({ address: accounts[1].address }).view()).toEqual(balance1);
        });

        it.skip('transfer into account to overflow', () => {});

        it('transfer on behalf of other without approval', async () => {
          const balance0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
          const amount = balance0 / 2n;
          expect(amount).toBeGreaterThan(0n);

          // We need to compute the message we want to sign.
          const messageHash = await hashPayload([
            FunctionSelector.fromSignature('transfer((Field),(Field),Field)').toField(),
            accounts[0].address.toField(),
            accounts[1].address.toField(),
            new Fr(amount),
          ]);

          await expect(
            asset.methods
              .transfer({ address: accounts[0].address }, { address: accounts[1].address }, amount)
              .simulate({ origin: accounts[1].address }),
          ).rejects.toThrowError(`Unknown auth witness for message hash 0x${messageHash.toString('hex')}`);
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

    it('on behalf of self', async () => {
      const balancePub = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
      const balancePriv = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
      const amount = balancePub / 2n;
      expect(amount).toBeGreaterThan(0n);

      const tx = asset.methods
        .shield({ address: accounts[0].address }, amount, secretHash)
        .send({ origin: accounts[0].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
        balancePub - amount,
      );
      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balancePriv);

      // Redeem it
      const txClaim = asset.methods
        .redeem_shield({ address: accounts[0].address }, amount, secret)
        .send({ origin: accounts[0].address });
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);
      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
        balancePub - amount,
      );
      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
        balancePriv + amount,
      );
    });

    it('on behalf of other', async () => {
      const balancePub = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
      const balancePriv = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
      const amount = balancePub / 2n;
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign.
      const messageHash = await hashPayload([
        FunctionSelector.fromSignature('shield((Field),Field,Field)').toField(),
        accounts[0].address.toField(),
        new Fr(amount),
        secretHash,
      ]);

      // Add it to the wallet as approved
      const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
      const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
      const validTxReceipt = await setValidTx.wait();
      expect(validTxReceipt.status).toBe(TxStatus.MINED);

      const tx = asset.methods
        .shield({ address: accounts[0].address }, amount, secretHash)
        .send({ origin: accounts[1].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
        balancePub - amount,
      );
      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balancePriv);

      // Redeem it
      const txClaim = asset.methods
        .redeem_shield({ address: accounts[0].address }, amount, secret)
        .send({ origin: accounts[0].address });
      const receiptClaim = await txClaim.wait();
      expect(receiptClaim.status).toBe(TxStatus.MINED);
      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
        balancePub - amount,
      );
      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
        balancePriv + amount,
      );

      // Check that claiming again will hit a double-spend and fail.
      const txClaimDoubleSpend = asset.methods
        .redeem_shield({ address: accounts[0].address }, amount, secret)
        .send({ origin: accounts[0].address });
      await txClaimDoubleSpend.isMined();
      const receiptDoubleSpend = await txClaimDoubleSpend.getReceipt();
      expect(receiptDoubleSpend.status).toBe(TxStatus.DROPPED);
    }, 30_000);

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods
            .shield({ address: accounts[0].address }, amount, secretHash)
            .simulate({ origin: accounts[0].address }),
        ).rejects.toThrowError('Assertion failed: Underflow');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePub = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const balancePriv = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const amount = balancePub + 1n;
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign.
        const messageHash = await hashPayload([
          FunctionSelector.fromSignature('shield((Field),Field,Field)').toField(),
          accounts[0].address.toField(),
          new Fr(amount),
          secretHash,
        ]);

        // Add it to the wallet as approved
        const me = await SchnorrAuthWitnessAccountContract.at(accounts[0].address, wallet);
        const setValidTx = me.methods.set_is_valid_storage(messageHash, 1).send({ origin: accounts[0].address });
        const validTxReceipt = await setValidTx.wait();
        expect(validTxReceipt.status).toBe(TxStatus.MINED);

        await expect(
          asset.methods
            .shield({ address: accounts[0].address }, amount, secretHash)
            .simulate({ origin: accounts[1].address }),
        ).rejects.toThrowError('Assertion failed: Underflow');

        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(balancePub);
        expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balancePriv);
      });

      it('on behalf of other (without approval)', async () => {
        const balance = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const amount = balance / 2n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods
            .shield({ address: accounts[0].address }, amount, secretHash)
            .simulate({ origin: accounts[1].address }),
        ).rejects.toThrowError(`Assertion failed: invalid call`);
      });
    });
  });

  describe('Unshielding', () => {
    it('on behalf of self', async () => {
      const balancePriv = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
      const balancePub = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
      const amount = balancePriv / 2n;
      expect(amount).toBeGreaterThan(0n);

      const tx = asset.methods
        .unshield({ address: accounts[0].address }, { address: accounts[0].address }, amount)
        .send({ origin: accounts[0].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
        balancePriv - amount,
      );
      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(
        balancePub + amount,
      );
    });

    it('on behalf of other', async () => {
      const balancePub0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
      const balancePub1 = await asset.methods.balance_of_public({ address: accounts[1].address }).view();
      const balancePriv0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
      const balancePriv1 = await asset.methods.balance_of_private({ address: accounts[1].address }).view();
      const amount = balancePriv0 / 2n;
      expect(amount).toBeGreaterThan(0n);

      // We need to compute the message we want to sign.
      const messageHash = await hashPayload([
        FunctionSelector.fromSignature('unshield((Field),(Field),Field)').toField(),
        accounts[0].address.toField(),
        accounts[1].address.toField(),
        new Fr(amount),
      ]);

      // Both wallets are connected to same node and rpc so we could just insert directly using
      // await wallet.signAndAddAuthWitness(messageHash, { origin: accounts[0].address });
      // But doing it in two actions to show the flow.
      const witness = await wallet.signAndGetAuthWitness(messageHash, { origin: accounts[0].address });
      await wallet.addAuthWitness(Fr.fromBuffer(messageHash), witness);

      const tx = asset.methods
        .unshield({ address: accounts[0].address }, { address: accounts[1].address }, amount)
        .send({ origin: accounts[1].address });
      const receipt = await tx.wait();
      expect(receipt.status).toBe(TxStatus.MINED);

      expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(balancePub0);
      expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(
        balancePriv0 - amount,
      );
      expect(await asset.methods.balance_of_public({ address: accounts[1].address }).view()).toEqual(
        balancePub1 + amount,
      );
      expect(await asset.methods.balance_of_private({ address: accounts[1].address }).view()).toEqual(balancePriv1);
    });

    describe('failure cases', () => {
      it('on behalf of self (more than balance)', async () => {
        const balancePriv = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const amount = balancePriv + 1n;
        expect(amount).toBeGreaterThan(0n);

        await expect(
          asset.methods
            .unshield({ address: accounts[0].address }, { address: accounts[0].address }, amount)
            .simulate({ origin: accounts[0].address }),
        ).rejects.toThrowError('Assertion failed: Balance too low');
      });

      it('on behalf of other (more than balance)', async () => {
        const balancePub0 = await asset.methods.balance_of_public({ address: accounts[0].address }).view();
        const balancePub1 = await asset.methods.balance_of_public({ address: accounts[1].address }).view();
        const balancePriv0 = await asset.methods.balance_of_private({ address: accounts[0].address }).view();
        const balancePriv1 = await asset.methods.balance_of_private({ address: accounts[1].address }).view();
        const amount = balancePriv0 + 2n;
        expect(amount).toBeGreaterThan(0n);

        // We need to compute the message we want to sign.
        const messageHash = await hashPayload([
          FunctionSelector.fromSignature('unshield((Field),(Field),Field)').toField(),
          accounts[0].address.toField(),
          accounts[1].address.toField(),
          new Fr(amount),
        ]);

        // Both wallets are connected to same node and rpc so we could just insert directly using
        // await wallet.signAndAddAuthWitness(messageHash, { origin: accounts[0].address });
        // But doing it in two actions to show the flow.
        const witness = await wallet.signAndGetAuthWitness(messageHash, { origin: accounts[0].address });
        await wallet.addAuthWitness(Fr.fromBuffer(messageHash), witness);

        await expect(
          asset.methods
            .unshield({ address: accounts[0].address }, { address: accounts[1].address }, amount)
            .simulate({ origin: accounts[1].address }),
        ).rejects.toThrowError('Assertion failed: Balance too low');

        expect(await asset.methods.balance_of_public({ address: accounts[0].address }).view()).toEqual(balancePub0);
        expect(await asset.methods.balance_of_private({ address: accounts[0].address }).view()).toEqual(balancePriv0);
        expect(await asset.methods.balance_of_public({ address: accounts[1].address }).view()).toEqual(balancePub1);
        expect(await asset.methods.balance_of_private({ address: accounts[1].address }).view()).toEqual(balancePriv1);
      });
    });
  });
});
