import { AztecAddress, type DeployOptions, ProtocolContractAddress } from '@aztec/aztec.js';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn, Logger } from '@aztec/foundation/log';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { type AccountType, CLIWallet } from '../utils/wallet.js';

export async function createAccount(
  wallet: CLIWallet,
  accountType: AccountType,
  secretKey: Fr | undefined,
  publicKey: string | undefined,
  alias: string | undefined,
  registerOnly: boolean,
  publicDeploy: boolean,
  skipInitialization: boolean,
  wait: boolean,
  feeOpts: CLIFeeArgs,
  json: boolean,
  verbose: boolean,
  debugLogger: Logger,
  log: LogFn,
) {
  secretKey ??= Fr.random();

  const account = await wallet.createOrRetrieveAccount(
    undefined /* address, we don't have it yet */,
    secretKey,
    accountType,
    Fr.ZERO,
    publicKey,
  );
  const { salt } = account.getInstance();
  const { address, publicKeys, partialAddress } = await account.getCompleteAddress();

  const out: Record<string, any> = {};
  if (json) {
    out.address = address;
    out.publicKey = publicKeys;
    if (secretKey) {
      out.secretKey = secretKey;
    }
    out.partialAddress = partialAddress;
    out.salt = salt;
    out.initHash = account.getInstance().initializationHash;
    out.deployer = account.getInstance().deployer;
  } else {
    log(`\nNew account:\n`);
    log(`Address:         ${address.toString()}`);
    log(`Public key:      ${publicKeys.toString()}`);
    if (secretKey) {
      log(`Secret key:     ${secretKey.toString()}`);
    }
    log(`Partial address: ${partialAddress.toString()}`);
    log(`Salt:            ${salt.toString()}`);
    log(`Init hash:       ${account.getInstance().initializationHash.toString()}`);
    log(`Deployer:        ${account.getInstance().deployer.toString()}`);
  }

  let tx;
  let txReceipt;
  if (!registerOnly) {
    const userFeeOptions = await feeOpts.toUserFeeOptions(wallet, address);
    const feePayer = await userFeeOptions.paymentMethod?.getFeePayer();
    let paymentAsset;
    try {
      paymentAsset = await userFeeOptions.paymentMethod?.getAsset();
      // eslint-disable-next-line no-empty
    } catch {}

    // If someone else is paying the fee, set them as the deployment account.
    // What we're trying to identify here is that the fee payment method is
    // FeeJuicePaymentMethod(anAddressThatsNotTheAccountBeingDeployed)
    const delegatedDeployment =
      paymentAsset?.equals(ProtocolContractAddress.FeeJuice) && !feePayer?.equals(account.getAddress());
    const from = delegatedDeployment ? feePayer! : AztecAddress.ZERO;

    const deployOpts: DeployOptions = {
      skipClassPublication: !publicDeploy,
      skipInstancePublication: !publicDeploy,
      skipInitialization,
      from,
      fee: userFeeOptions,
      // Do not mix the deployer in the address, since the account
      // was created (and thus its address was fixed) like this
      universalDeploy: true,
      contractAddressSalt: salt,
    };

    /*
     * This is usually handled by accountManager.create(), but we're accessing the lower
     * level method to get gas and timings. That means we have to replicate some of the logic here.
     * In case we're initializing and/or publishing our own account, we need to hijack the payment method for the fee,
     * wrapping it in the one that will make use of the freshly deployed account's
     * entrypoint. For reference, see aztec.js/src/account_manager.ts:sendAccountContractSetupTx()
     * Also, salt and universalDeploy have to be explicitly provided
     */
    deployOpts.fee =
      !delegatedDeployment && deployOpts.fee
        ? { ...deployOpts.fee, paymentMethod: await account.getSelfPaymentMethod(deployOpts.fee.paymentMethod) }
        : deployOpts.fee;

    const deployMethod = await account.getDeployMethod();
    const { stats, estimatedGas } = await deployMethod.simulate({
      ...deployOpts,
      fee: { ...deployOpts.fee, estimateGas: true },
    });

    printProfileResult(stats, log);

    if (feeOpts.estimateOnly) {
      if (json) {
        out.fee = {
          gasLimits: {
            da: estimatedGas.gasLimits.daGas,
            l2: estimatedGas.gasLimits.l2Gas,
          },
          teardownGasLimits: {
            da: estimatedGas.teardownGasLimits.daGas,
            l2: estimatedGas.teardownGasLimits,
          },
        };
      }
    } else {
      const provenTx = await deployMethod.prove({
        ...deployOpts,
        fee: {
          ...deployOpts.fee,
          gasSettings: estimatedGas,
        },
      });
      if (verbose) {
        printProfileResult(provenTx.stats!, log);
      }
      tx = provenTx.send();

      const txHash = await tx.getTxHash();
      debugLogger.debug(`Account contract tx sent with hash ${txHash.toString()}`);
      out.txHash = txHash;
      if (wait) {
        if (!json) {
          log(`\nWaiting for account contract deployment...`);
        }
        txReceipt = await tx.wait({ timeout: DEFAULT_TX_TIMEOUT_S });
        out.txReceipt = {
          status: txReceipt.status,
          transactionFee: txReceipt.transactionFee,
        };
      }
    }
  }

  if (json) {
    log(prettyPrintJSON(out));
  } else {
    if (tx) {
      log(`Deploy tx hash:  ${(await tx.getTxHash()).toString()}`);
    }
    if (txReceipt) {
      log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
    }
  }

  return { alias, address, secretKey, salt };
}
