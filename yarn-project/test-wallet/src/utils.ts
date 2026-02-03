import type { InitialAccountData } from '@aztec/accounts/testing';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  ContractFunctionInteraction,
  DeployMethod,
  type DeployOptions,
  NO_WAIT,
  type NoWait,
  type SendInteractionOptions,
  type WaitOpts,
  toSendOptions,
} from '@aztec/aztec.js/contracts';
import { type AztecNode, waitForTx } from '@aztec/aztec.js/node';
import { SimulationError } from '@aztec/stdlib/errors';
import { type OffchainEffect, type ProvingStats, Tx, TxHash, type TxReceipt } from '@aztec/stdlib/tx';

import { inspect } from 'util';

import type { BaseTestWallet } from './wallet/test_wallet.js';

/**
 * Options for sending a proven transaction.
 */
export type ProvenTxSendOpts = {
  /**
   * Whether to wait for the transaction to be mined.
   * - undefined (default): wait with default options and return TxReceipt
   * - WaitOpts object: wait with custom options and return TxReceipt
   * - NO_WAIT: return txHash immediately without waiting
   */
  wait?: NoWait | WaitOpts;
};

/**
 * Return type for ProvenTx.send based on wait option.
 */
export type ProvenTxSendReturn<T extends NoWait | WaitOpts | undefined> = T extends NoWait ? TxHash : TxReceipt;

/**
 * Deploys the SchnorrAccount contracts backed by prefunded addresses
 * at genesis. This can be directly used to pay for transactions in FeeJuice.
 */
export async function deployFundedSchnorrAccounts(
  wallet: BaseTestWallet,
  accountsData: InitialAccountData[],
  waitOptions?: WaitOpts,
) {
  const accountManagers = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accountsData.length; i++) {
    const { secret, salt, signingKey } = accountsData[i];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod.send({
      from: AztecAddress.ZERO,
      skipClassPublication: i !== 0, // Publish the contract class at most once.
      wait: waitOptions,
    });
    accountManagers.push(accountManager);
  }
  return accountManagers;
}

/**
 * Registers the initial local network accounts in the wallet.
 * @param wallet - Test wallet to use to register the accounts.
 * @returns Addresses of the registered accounts.
 */
export async function registerInitialLocalNetworkAccountsInWallet(wallet: BaseTestWallet): Promise<AztecAddress[]> {
  const testAccounts = await getInitialTestAccountsData();
  return Promise.all(
    testAccounts.map(async account => {
      return (await wallet.createSchnorrAccount(account.secret, account.salt, account.signingKey)).address;
    }),
  );
}
/**
 * A proven transaction that can be sent to the network. Returned by the `prove` method of the test wallet
 */
export class ProvenTx extends Tx {
  constructor(
    private node: AztecNode,
    tx: Tx,
    /** The offchain effects emitted during the execution of the transaction. */
    public offchainEffects: OffchainEffect[],
    // eslint-disable-next-line jsdoc/require-jsdoc
    public stats?: ProvingStats,
  ) {
    super(tx.getTxHash(), tx.data, tx.chonkProof, tx.contractClassLogFields, tx.publicFunctionCalldata);
  }

  /**
   * Sends the transaction to the network.
   * @param options - Send options including whether to wait.
   * @returns The transaction receipt if waiting, or the transaction hash if not.
   */
  send(options?: Omit<ProvenTxSendOpts, 'wait'>): Promise<TxReceipt>;
  // eslint-disable-next-line jsdoc/require-jsdoc
  send<W extends ProvenTxSendOpts['wait']>(options: ProvenTxSendOpts & { wait: W }): Promise<ProvenTxSendReturn<W>>;
  async send(options?: ProvenTxSendOpts): Promise<TxHash | TxReceipt> {
    const txHash = this.getTxHash();
    await this.node.sendTx(this).catch(err => {
      throw this.contextualizeError(err, inspect(this));
    });

    if (options?.wait === NO_WAIT) {
      return txHash;
    }

    const waitOpts = typeof options?.wait === 'object' ? options.wait : undefined;
    return await waitForTx(this.node, txHash, waitOpts);
  }

  private contextualizeError(err: Error, ...context: string[]): Error {
    let contextStr = '';
    if (context.length > 0) {
      contextStr = `\nContext:\n${context.join('\n')}`;
    }
    if (err instanceof SimulationError) {
      err.setAztecContext(contextStr);
    }
    return err;
  }
}

/**
 * Helper function to prove an interaction via a TestWallet
 * @param wallet - The TestWallet to use
 * @param interaction - The interaction to prove
 * @param options - Either SendInteractionOptions (for ContractFunctionInteraction) or DeployOptions (for DeployMethod)
 * @returns - A proven transaction ready do be sent to the network
 */
export async function proveInteraction(
  wallet: BaseTestWallet,
  interaction: ContractFunctionInteraction | DeployMethod,
  options: SendInteractionOptions | DeployOptions,
) {
  let execPayload;
  if (interaction instanceof DeployMethod) {
    execPayload = await interaction.request(interaction.convertDeployOptionsToRequestOptions(options));
  } else {
    execPayload = await interaction.request(options);
  }
  return wallet.proveTx(execPayload, toSendOptions(options));
}
