import { AztecAddress } from '@aztec/aztec.js/addresses';
import { NO_WAIT } from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { DeployAccountOptions } from '@aztec/aztec.js/wallet';
import { prettyPrintJSON } from '@aztec/cli/cli-utils';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn, Logger } from '@aztec/foundation/log';
import type { TxHash, TxReceipt } from '@aztec/stdlib/tx';

import { DEFAULT_TX_TIMEOUT_S } from '../utils/cli_wallet_and_node_wrapper.js';
import type { AccountType } from '../utils/constants.js';
import { CLIFeeArgs } from '../utils/options/fees.js';
import { printProfileResult } from '../utils/profiling.js';
import { CLIWallet } from '../utils/wallet.js';

export async function createAccount(
  wallet: CLIWallet,
  aztecNode: AztecNode,
  accountType: AccountType,
  secretKey: Fr | undefined,
  publicKey: string | undefined,
  alias: string | undefined,
  deployer: AztecAddress | undefined,
  registerOnly: boolean,
  skipInitialization: boolean,
  publicDeploy: boolean,
  registerClass: boolean,
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
  }

  let txHash: TxHash | undefined;
  let txReceipt: TxReceipt | undefined;
  if (!registerOnly) {
    const { paymentMethod, gasSettings } = await feeOpts.toUserFeeOptions(aztecNode, wallet, address);

    const delegatedDeployment = deployer && !account.address.equals(deployer);
    const from = delegatedDeployment ? deployer : AztecAddress.ZERO;

    const deployAccountOpts: DeployAccountOptions = {
      skipClassPublication: !registerClass,
      skipInstancePublication: !publicDeploy,
      skipInitialization,
      from,
      fee: { paymentMethod, gasSettings },
    };

    const deployMethod = await account.getDeployMethod();
    const { estimatedGas, stats } = await deployMethod.simulate({
      ...deployAccountOpts,
      fee: { ...deployAccountOpts.fee, estimateGas: true },
    });

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
      if (verbose) {
        printProfileResult(stats, log);
      }

      if (!json) {
        log(`\nWaiting for account contract deployment...`);
      }
      const result = await deployMethod.send({
        ...deployAccountOpts,
        fee: deployAccountOpts.fee
          ? {
              ...deployAccountOpts.fee,
              gasSettings: estimatedGas,
            }
          : undefined,
        wait: wait ? { timeout: DEFAULT_TX_TIMEOUT_S, returnReceipt: true } : NO_WAIT,
      });
      const isReceipt = (data: TxReceipt | TxHash): data is TxReceipt => 'txHash' in data;
      if (isReceipt(result)) {
        txReceipt = result;
        txHash = result.txHash;
        out.txReceipt = {
          status: txReceipt.status,
          transactionFee: txReceipt.transactionFee,
        };
      } else {
        txHash = result;
      }
      debugLogger.debug(`Account contract tx sent with hash ${txHash.toString()}`);
      out.txHash = txHash;
    }
  }

  if (json) {
    log(prettyPrintJSON(out));
  } else {
    if (txHash) {
      log(`Deploy tx hash:  ${txHash.toString()}`);
    }
    if (txReceipt) {
      log(`Deploy tx fee:   ${txReceipt.transactionFee}`);
    }
  }

  return { alias, address, secretKey, salt };
}
