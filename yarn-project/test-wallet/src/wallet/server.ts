import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { type Account, SignerlessAccount } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fq, Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { PXE, type PXEConfig, type PXECreationOptions, createPXE, getPXEConfig } from '@aztec/pxe/server';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { BaseTestWallet } from './test_wallet.js';

/**
 * A TestWallet implementation to be used in server settings (e.g. e2e tests).
 * Note that the only difference from `lazy` and `bundle` test wallets is that it uses the `createPXE` function
 * from the `pxe/server` package.
 */
export class TestWallet extends BaseTestWallet {
  constructor(
    pxe: PXE,
    private readonly nodeRef: AztecNodeProxy,
  ) {
    super(pxe, nodeRef);
  }

  static async create(
    node: AztecNode,
    overridePXEConfig?: Partial<PXEConfig>,
    options: PXECreationOptions = { loggers: {} },
  ): Promise<TestWallet> {
    const nodeRef = new AztecNodeProxy(node);
    const pxeConfig = Object.assign(getPXEConfig(), {
      proverEnabled: overridePXEConfig?.proverEnabled ?? false,
      ...overridePXEConfig,
    });
    const pxe = await createPXE(nodeRef, pxeConfig, options);
    return new TestWallet(pxe, nodeRef);
  }

  /**
   * Updates the underlying node that this wallet and its PXE communicate with.
   * @param node - The new AztecNode to forward all calls to.
   */
  updateNode(node: AztecNode): void {
    this.nodeRef.updateTargetNode(node);
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager> {
    signingKey = signingKey ?? deriveSigningKey(secret);
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaRAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaKAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    // Account contracts can only be overridden if they have an associated address
    // Overwriting SignerlessAccount is not supported, and does not really make sense
    // since it has no authorization mechanism.
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(`Cannot create fake account data for SignerlessAccount at address: ${address}`);
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress);
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }
}

/**
 * Extends AztecNode via declaration merging so instances can be used wherever AztecNode is expected.
 * The actual method forwarding is handled by a Proxy in the class constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface AztecNodeProxy extends AztecNode {}

/**
 * Mutable wrapper around an AztecNode that forwards all calls to the current target.
 * Allows swapping the underlying node at runtime via updateTargetNode, which is useful
 * for tests that need to redirect a wallet from one node to another without recreating it.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AztecNodeProxy {
  constructor(private target: AztecNode) {
    return new Proxy(this, {
      get: (obj, prop, receiver) => {
        // Own properties and methods (updateTargetNode, target) are served directly.
        if (Reflect.has(obj, prop)) {
          return Reflect.get(obj, prop, receiver);
        }
        // Everything else is forwarded to the current target node.
        const val = (obj.target as unknown as Record<string | symbol, unknown>)[prop];
        return typeof val === 'function' ? val.bind(obj.target) : val;
      },
    });
  }

  /**
   * Updates the underlying node that this reference points to.
   * @param node - The new node to forward calls to.
   */
  updateTargetNode(node: AztecNode): void {
    this.target = node;
  }
}
