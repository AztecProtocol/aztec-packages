import { type AccountManager, type Fr } from '@aztec/aztec.js';
import { type ConfigMappingsType } from '@aztec/foundation/config';
import { type ServerList } from '@aztec/foundation/json-rpc/server';
import { type LogFn } from '@aztec/foundation/log';
import { type PXEService } from '@aztec/pxe';

import chalk from 'chalk';
import { type Command } from 'commander';

import { type AztecStartOption, aztecStartOptions } from './aztec_start_options.js';

export interface ServiceStarter<T = any> {
  (options: T, signalHandlers: (() => Promise<void>)[], logger: LogFn): Promise<ServerList>;
}

export const installSignalHandlers = (logFn: LogFn, cb?: Array<() => Promise<void>>) => {
  const shutdown = async () => {
    logFn('Shutting down...');
    if (cb) {
      await Promise.all(cb);
    }
    process.exit(0);
  };
  process.removeAllListeners('SIGINT');
  process.removeAllListeners('SIGTERM');
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

/**
 * Creates logs for the initial accounts
 * @param accounts - The initial accounts
 * @param pxe - A PXE instance to get the registered accounts
 * @returns A string array containing the initial accounts details
 */
export async function createAccountLogs(
  accounts: {
    /**
     * The account object
     */
    account: AccountManager;
    /**
     * The secret key of the account
     */
    secretKey: Fr;
  }[],
  pxe: PXEService,
) {
  const registeredAccounts = await pxe.getRegisteredAccounts();
  const accountLogStrings = [`Initial Accounts:\n\n`];
  for (const account of accounts) {
    const completeAddress = account.account.getCompleteAddress();
    if (registeredAccounts.find(a => a.equals(completeAddress))) {
      accountLogStrings.push(` Address: ${completeAddress.address.toString()}\n`);
      accountLogStrings.push(` Partial Address: ${completeAddress.partialAddress.toString()}\n`);
      accountLogStrings.push(` Secret Key: ${account.secretKey.toString()}\n`);
      accountLogStrings.push(
        ` Master nullifier public key: ${completeAddress.publicKeys.masterNullifierPublicKey.toString()}\n`,
      );
      accountLogStrings.push(
        ` Master incoming viewing public key: ${completeAddress.publicKeys.masterIncomingViewingPublicKey.toString()}\n\n`,
      );
      accountLogStrings.push(
        ` Master outgoing viewing public key: ${completeAddress.publicKeys.masterOutgoingViewingPublicKey.toString()}\n\n`,
      );
      accountLogStrings.push(
        ` Master tagging public key: ${completeAddress.publicKeys.masterTaggingPublicKey.toString()}\n\n`,
      );
    }
  }
  return accountLogStrings;
}

export function getMaxLengths(sections: { [key: string]: AztecStartOption[] }): [number, number] {
  let maxFlagLength = 0;
  let maxDefaultLength = 0;

  Object.values(sections).forEach(options => {
    options.forEach(option => {
      if (option.flag.length > maxFlagLength) {
        maxFlagLength = option.flag.length;
      }
      const defaultLength = option.defaultValue ? option.defaultValue.length : 0;
      if (defaultLength > maxDefaultLength) {
        maxDefaultLength = defaultLength;
      }
    });
  });

  return [maxFlagLength + 1, maxDefaultLength + 1];
}

export function formatHelpLine(
  option: string,
  defaultValue: string,
  envVar: string,
  maxOptionLength: number,
  maxDefaultLength: number,
): string {
  const paddedOption = option.padEnd(maxOptionLength + 2, ' ');
  const paddedDefault = defaultValue.padEnd(maxDefaultLength + 2, ' ');

  return `${chalk.cyan(paddedOption)}${chalk.yellow(paddedDefault)}${chalk.green(envVar)}`;
}

const getDefaultOrEnvValue = (opt: AztecStartOption) => {
  let val;
  // if the option is set in the environment, use that & parse it
  if (opt.envVar && process.env[opt.envVar]) {
    val = process.env[opt.envVar];
    if (val && opt.parseVal) {
      return opt.parseVal(val);
    }
    // if no env variable, use the default value
  } else if (opt.defaultValue) {
    val = opt.defaultValue;
  }

  return val;
};

// Function to add options dynamically
export const addOptions = (cmd: Command, options: AztecStartOption[]) => {
  options.forEach(opt => {
    cmd.option(
      opt.flag,
      `${opt.description} (default: ${opt.defaultValue}) ($${opt.envVar})`,
      opt.parseVal ? opt.parseVal : val => val,
      getDefaultOrEnvValue(opt),
    );
  });
};

export const printAztecStartHelpText = () => {
  const helpTextLines: string[] = [''];
  const [maxFlagLength, maxDefaultLength] = getMaxLengths(aztecStartOptions);

  Object.keys(aztecStartOptions).forEach(category => {
    helpTextLines.push(chalk.bold.blue(`  ${category}`));
    helpTextLines.push('');

    aztecStartOptions[category].forEach(opt => {
      const defaultValueText = opt.defaultValue
        ? `(default: ${opt.printDefault ? opt.printDefault(opt.defaultValue) : opt.defaultValue})`
        : '';
      const envVarText = opt.envVar ? `($${opt.envVar})` : '';
      const flagText = `${opt.flag}`;

      const paddedText = formatHelpLine(flagText, defaultValueText, envVarText, maxFlagLength, maxDefaultLength);

      helpTextLines.push(`    ${paddedText}`);
      helpTextLines.push(`          ${chalk.white(opt.description)}`);
      helpTextLines.push('');
    });
  });

  return helpTextLines.join('\n');
};

/**
 * Extracts namespaced options from a key-value map.
 * @param options - Key-value map of options.
 * @param namespace - The namespace to extract.
 * @returns Key-value map of namespaced options.
 */
export const extractNamespacedOptions = (options: Record<string, any>, namespace: string) => {
  const extract = `${namespace}.`;
  const namespacedOptions: Record<string, any> = {};
  for (const key in options) {
    if (key.startsWith(extract)) {
      namespacedOptions[key.replace(extract, '')] = options[key];
    }
  }
  return namespacedOptions;
};

/**
 * Extracts relevant options from a key-value map.
 * @template T - The type of the relevant options.
 * @param options - Key-value map of options.
 * @param mappings - The mappings to extract.
 * @param namespace - The namespace to extract for.
 * @returns Key-value map of relevant options.
 */
export const extractRelevantOptions = <T>(
  options: Record<string, any>,
  mappings: ConfigMappingsType<T>,
  namespace: string,
): T => {
  const relevantOptions: T = {} as T;

  // Iterate over each key in the options
  Object.keys(options).forEach(optionKey => {
    const keyParts = optionKey.split('.');
    const optionNamespace = keyParts.length > 1 ? keyParts[0] : '';
    const mainKey = keyParts.length > 1 ? keyParts[1] : keyParts[0];

    // Check if the key exists in the mappings
    if (mainKey in mappings) {
      // Check for duplicates in the options
      const duplicates = Object.keys(options).filter(optKey => {
        const optKeyParts = optKey.split('.');
        return optKeyParts[1] === mainKey || optKeyParts[0] === mainKey;
      });

      // If duplicates are found, use the namespace to differentiate
      if (duplicates.length > 1) {
        if (namespace === optionNamespace) {
          relevantOptions[mainKey as keyof T] = options[optionKey];
        }
      } else {
        // If no duplicates, extract the value without considering the namespace
        relevantOptions[mainKey as keyof T] = options[optionKey];
      }
    }
  });

  return relevantOptions;
};
