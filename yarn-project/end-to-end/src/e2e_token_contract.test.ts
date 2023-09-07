import { AztecNodeService } from '@aztec/aztec-node';
import { AztecRPCServer } from '@aztec/aztec-rpc';
import {
  Account,
  AuthEntrypointCollection,
  AuthWitnessAccountContract,
  AuthWitnessEntrypointWallet,
  AztecAddress,
  CheatCodes,
  Fr,
  computeMessageSecretHash,
} from '@aztec/aztec.js';
import { CompleteAddress, FunctionSelector, PrivateKey } from '@aztec/circuits.js';
import { DebugLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts/types';
import { AztecRPC, TxStatus } from '@aztec/types';

import { setup } from './fixtures/utils.js';

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

  let cc: CheatCodes;
  let asset: TokenContract;

  const tokenSim = new TokenSimulator();

  beforeAll(async () => {
    ({ aztecNode, aztecRpcServer, logger, cheatCodes: cc } = await setup(0));

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
    it('Set admin (not admin)', async () => {
      await expect(
        asset.methods.set_admin({ address: accounts[0].address }).simulate({ origin: accounts[0].address }),
      ).rejects.toThrowError('Assertion failed: caller is not admin');
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
    it('Revoke minter not as admin', async () => {
      await expect(
        asset.methods.set_minter({ address: accounts[0].address }, 0).simulate({ origin: accounts[0].address }),
      ).rejects.toThrowError('Assertion failed: caller is not admin');
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
      it.skip('as non-minter', () => {});
      it.skip('mint overflow', () => {});
    });

    describe.skip('Private', () => {
      describe('Mint flow', () => {
        const secret = Fr.random();
        const amount = 10000n;
        let secretHash: Fr;

        beforeAll(async () => {
          secretHash = await computeMessageSecretHash(secret);
        });

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

        it('try to redeem as recipient (double-spend) [REVERTS]', async () => {
          {
            const txClaim = asset.methods
              .redeem_shield({ address: accounts[0].address }, amount, secret)
              .send({ origin: accounts[0].address });
            await txClaim.isMined();
            const receiptClaim = await txClaim.getReceipt();
            expect(receiptClaim.status).toBe(TxStatus.DROPPED);
          }
        });
      });
      it.skip('mint_private as non-minter', () => {});
      it.skip('mint overflow', () => {});
    });
  });

  describe('Transfer', () => {
    describe('public', () => {
      it.skip('transfer less than balance', () => {});
      it.skip('transfer more than balance [REVERT]', () => {});
      it.skip('transfer to self', () => {});
      it.skip('transfer on behalf of other', () => {});
      it.skip('transfer on behalf of other (more than allowance) [REVERT]', () => {});
      it.skip('transfer into account to overflow', () => {});
    });

    describe('private', () => {
      it.skip('transfer less than balance', () => {});
      it.skip('transfer more than balance [REVERT]', () => {});
      it.skip('transfer to self', () => {});
      it.skip('transfer on behalf of other', () => {});
      it.skip('transfer into account to overflow', () => {});
    });
  });

  describe('Shielding', () => {
    it.skip('on behalf of self', () => {});
    it.skip('claiming', () => {});
    it.skip('claiming (double-spend) [REVERT]', () => {});
    it.skip('on behalf of self (more than balance) [REVERT]', () => {});
    it.skip('on behalf of other', () => {});
    it.skip('claiming', () => {});
    it.skip('claiming (double-spend) [REVERT]', () => {});
    it.skip('on behalf of other (more than allowance) [REVERT]', () => {});
  });

  describe('Unshielding', () => {
    it.skip('on behalf of self', () => {});
    it.skip('on behalf of other', () => {});
  });
});
