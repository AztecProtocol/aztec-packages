import type { InitialAccountData } from '@aztec/accounts/testing';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import {
  AztecAddress,
  type AztecNode,
  ContractFunctionInteraction,
  DeployMethod,
  type DeployOptions,
  type SendInteractionOptions,
  SentTx,
  Tx,
  type WaitOpts,
  toSendOptions,
} from '@aztec/aztec.js';
import type { OffchainEffect, ProvingStats } from '@aztec/stdlib/tx';

import type { BaseTestWallet } from './wallet/test_wallet.js';

/**
 * Deploys the SchnorrAccount contracts backed by prefunded addresses
 * at genesis. This can be directly used to pay for transactions in FeeJuice.
 */
export async function deployFundedSchnorrAccounts(
  wallet: BaseTestWallet,
  aztecNode: AztecNode,
  accountsData: InitialAccountData[],
  waitOptions?: WaitOpts,
) {
  const accountManagers = [];
  // Serial due to https://github.com/AztecProtocol/aztec-packages/issues/12045
  for (let i = 0; i < accountsData.length; i++) {
    const { secret, salt, signingKey } = accountsData[i];
    const accountManager = await wallet.createSchnorrAccount(secret, salt, signingKey);
    const deployMethod = await accountManager.getDeployMethod();
    await deployMethod
      .send({
        from: AztecAddress.ZERO,
        skipClassPublication: i !== 0, // Publish the contract class at most once.
      })
      .wait(waitOptions);
    accountManagers.push(accountManager);
  }
  return accountManagers;
}

/**
 * Registers the initial sandbox accounts in the wallet.
 * @param wallet - Test wallet to use to register the accounts.
 * @returns Addresses of the registered accounts.
 */
export async function registerInitialSandboxAccountsInWallet(wallet: BaseTestWallet): Promise<AztecAddress[]> {
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
    super(tx.getTxHash(), tx.data, tx.clientIvcProof, tx.contractClassLogFields, tx.publicFunctionCalldata);
  }

  send() {
    const sendTx = async () => {
      await this.node.sendTx(this);
      return this.getTxHash();
    };
    return new SentTx(this.node, sendTx);
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
  return wallet.proveTx(execPayload, await toSendOptions(options));
}
