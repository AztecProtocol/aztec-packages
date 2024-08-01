import { getEcdsaRSSHAccount } from '@aztec/accounts/ecdsa';
import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { getIdentities } from '@aztec/accounts/utils';
import { type DeployAccountOptions, createCompatibleClient } from '@aztec/aztec.js';
import { deriveSigningKey } from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { type IFeeOpts, printGasEstimates } from '../fees.js';
import { WalletDB } from '../storage/wallet_db.js';
import { AccountType, createAndStoreAccount } from '../utils/accounts.js';
import { extractECDSAPublicKeyFromBase64String } from '../utils/ecdsa.js';

export async function createAccount(
  rpcUrl: string,
  accountType: AccountType,
  secretKey: Fr | undefined,
  publicKey: string | undefined,
  alias: string | undefined,
  registerOnly: boolean,
  publicDeploy: boolean,
  skipInitialization: boolean,
  wait: boolean,
  feeOpts: IFeeOpts,
  debugLogger: DebugLogger,
  log: LogFn,
) {
  const client = await createCompatibleClient(rpcUrl, debugLogger);

  const salt = Fr.ZERO;
  secretKey ??= Fr.random();

  const account = await createAndStoreAccount(client, accountType, secretKey, publicKey, salt, alias);
  const { address, publicKeys, partialAddress } = account.getCompleteAddress();

  log(`\nNew account:\n`);
  log(`Address:         ${address.toString()}`);
  log(`Public key:      0x${publicKeys.toString()}`);
  if (secretKey) {
    log(`Secret key:     ${secretKey.toString()}`);
  }
  log(`Partial address: ${partialAddress.toString()}`);
  log(`Salt:            ${salt.toString()}`);
  log(`Init hash:       ${account.getInstance().initializationHash.toString()}`);
  log(`Deployer:        ${account.getInstance().deployer.toString()}`);

  let tx;
  let txReceipt;
  if (registerOnly) {
    await account.register();
  } else {
    const wallet = await account.getWallet();
    const sendOpts: DeployAccountOptions = {
      ...feeOpts.toSendOpts(wallet),
      skipClassRegistration: !publicDeploy,
      skipPublicDeployment: !publicDeploy,
      skipInitialization: skipInitialization,
    };
    if (feeOpts.estimateOnly) {
      const gas = await (await account.getDeployMethod()).estimateGas({ ...sendOpts });
      printGasEstimates(feeOpts, gas, log);
    } else {
      tx = account.deploy({ ...sendOpts });
      const txHash = await tx.getTxHash();
      debugLogger.debug(`Account contract tx sent with hash ${txHash}`);
      if (wait) {
        log(`\nWaiting for account contract deployment...`);
        txReceipt = await tx.wait();
      }
    }
  }

  if (tx) {
    log(`Deploy tx hash:  ${await tx.getTxHash()}`);
  }
  if (txReceipt) {
    log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
  }
}
