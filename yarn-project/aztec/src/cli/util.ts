import type { AztecNodeConfig } from '@aztec/aztec-node';
import type { AccountManager } from '@aztec/aztec.js/wallet';
import { getNetworkConfig } from '@aztec/cli/config';
import { RegistryContract } from '@aztec/ethereum/contracts';
import type { ViemClient } from '@aztec/ethereum/types';
import type { ConfigMappingsType, NetworkNames } from '@aztec/foundation/config';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import type { ProverConfig } from '@aztec/stdlib/interfaces/server';
import { type VersionCheck, getPackageVersion } from '@aztec/stdlib/update-checker';
import type { EmbeddedWallet } from '@aztec/wallets/embedded';

import chalk from 'chalk';
import type { Command } from 'commander';
import type { Hex } from 'viem';

import { type AztecStartOption, aztecStartOptions } from './aztec_start_options.js';

export const enum ExitCode {
  SUCCESS = 0,
  ERROR = 1,
  ROLLUP_UPGRADE = 78, // EX_CONFIG from FreeBSD (https://man.freebsd.org/cgi/man.cgi?query=sysexits)
  VERSION_UPGRADE = 79, // prev + 1 because there's nothing better
  // 128 + int(SIGNAL)
  SIGHUP = 129,
  SIGINT = 130,
  SIGQUIT = 131,
  SIGTERM = 143,
}

let shutdownPromise: Promise<never> | undefined;
export function shutdown(logFn: LogFn, exitCode: ExitCode, cb?: Array<() => Promise<void>>): Promise<never> {
  if (shutdownPromise) {
    logFn('Already shutting down.');
    return shutdownPromise;
  }

  logFn('Shutting down...', { exitCode });
  if (cb) {
    shutdownPromise = Promise.allSettled(cb.map(fn => fn())).then(() => process.exit(exitCode));
  } else {
    // synchronously shuts down the process
    // no need to set shutdownPromise on this branch of the if statement because no more code will be executed
    process.exit(exitCode);
  }

  return shutdownPromise;
}

export function isShuttingDown(): boolean {
  return shutdownPromise !== undefined;
}

export const installSignalHandlers = (logFn: LogFn, cb?: Array<() => Promise<void>>) => {
  const signals = [
    ['SIGINT', ExitCode.SIGINT],
    ['SIGTERM', ExitCode.SIGTERM],
    ['SIGHUP', ExitCode.SIGHUP],
    ['SIQUIT', ExitCode.SIGQUIT],
  ] as const;

  for (const [signal, exitCode] of signals) {
    process.removeAllListeners(signal);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.once(signal, () => shutdown(logFn, exitCode, cb));
  }
};

/**
 * Creates logs for the initial accounts
 * @param accounts - The initial accounts
 * @param wallet - A EmbeddedWallet instance to get the registered accounts
 * @returns A string array containing the initial accounts details
 */
export async function createAccountLogs(accountManagers: AccountManager[], wallet: EmbeddedWallet) {
  const registeredAccounts = await wallet.getAccounts();
  const accountLogStrings = [`Initial Accounts:\n\n`];
  for (const accountManager of accountManagers) {
    const account = await accountManager.getAccount();
    const completeAddress = account.getCompleteAddress();
    if (registeredAccounts.find(a => a.item.equals(completeAddress.address))) {
      accountLogStrings.push(` Address: ${completeAddress.address.toString()}\n`);
      accountLogStrings.push(` Partial Address: ${completeAddress.partialAddress.toString()}\n`);
      accountLogStrings.push(` Secret Key: ${account.getSecretKey().toString()}\n`);
      accountLogStrings.push(` Master nullifier public key hash: ${completeAddress.publicKeys.npkMHash.toString()}\n`);
      accountLogStrings.push(` Master incoming viewing public key: ${completeAddress.publicKeys.ivpkM.toString()}\n\n`);
      accountLogStrings.push(
        ` Master outgoing viewing public key hash: ${completeAddress.publicKeys.ovpkMHash.toString()}\n\n`,
      );
      accountLogStrings.push(` Master tagging public key hash: ${completeAddress.publicKeys.tpkMHash.toString()}\n\n`);
      accountLogStrings.push(
        ` Master message-signing public key hash: ${completeAddress.publicKeys.mspkMHash.toString()}\n\n`,
      );
      accountLogStrings.push(
        ` Master fallback public key hash: ${completeAddress.publicKeys.fbpkMHash.toString()}\n\n`,
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

  // if the option is set in the environment, use that
  if (opt.env) {
    val = process.env[opt.env];
  }

  // if we have fallback env vars, check those
  if (!val && opt.fallback && opt.fallback.length > 0) {
    for (const fallback of opt.fallback) {
      val = process.env[fallback];
      if (val) {
        break;
      }
    }
  }

  // if we have a value, optionally parse it and return
  if (val) {
    if (opt.parseVal) {
      return opt.parseVal(val);
    }
    return val;
  } else if (opt.defaultValue !== undefined) {
    return opt.defaultValue;
  }
  return undefined;
};

// Function to add options dynamically
export const addOptions = (cmd: Command, options: AztecStartOption[]) => {
  options.forEach(opt => {
    cmd.option(
      opt.flag,
      `${opt.description} (default: ${opt.defaultValue}) ($${opt.env})`,
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
      const defaultValueText =
        opt.defaultValue || (Array.isArray(opt.defaultValue) && opt.defaultValue.length > 0)
          ? `(default: ${opt.printDefault ? opt.printDefault(opt.defaultValue) : opt.defaultValue})`
          : '';
      const envVarText = opt.env ? `($${opt.env})` : '';
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

/**
 * Downloads just enough points to be able to verify Chonk proofs.
 * @param opts - Whether proof are to be verifier
 * @param log - Logging function
 */
export async function preloadCrsDataForVerifying(
  { realProofs }: Pick<AztecNodeConfig, 'realProofs'>,
  log: LogFn,
): Promise<void> {
  if (realProofs) {
    const { Crs, GrumpkinCrs } = await import('@aztec/bb.js');
    await Promise.all([Crs.new(2 ** 1, undefined, log), GrumpkinCrs.new(2 ** 16, undefined, log)]);
  }
}

/**
 * Downloads enough points to be able to prove every server-side circuit
 * @param opts - Whether real proof are to be generated
 * @param log - Logging function
 */
export async function preloadCrsDataForServerSideProving(
  { realProofs }: Pick<ProverConfig, 'realProofs'>,
  log: LogFn,
): Promise<void> {
  if (realProofs) {
    const { Crs, GrumpkinCrs } = await import('@aztec/bb.js');
    await Promise.all([Crs.new(2 ** 25, undefined, log), GrumpkinCrs.new(2 ** 18, undefined, log)]);
  }
}

export async function setupVersionChecker(
  network: NetworkNames,
  followsCanonicalRollup: boolean,
  publicClient: ViemClient,
  signalHandlers: Array<() => Promise<void>>,
  cacheDir?: string,
): Promise<void> {
  const networkConfig = await getNetworkConfig(network, cacheDir);
  if (!networkConfig) {
    return;
  }

  const { VersionChecker } = await import('@aztec/stdlib/update-checker');

  const logger = createLogger('version_check');
  const registry = new RegistryContract(publicClient, networkConfig.registryAddress as Hex);

  const checks: Array<VersionCheck> = [];
  checks.push({
    name: 'node',
    currentVersion: getPackageVersion(),
    getLatestVersion: async () => {
      const cfg = await getNetworkConfig(network, cacheDir);
      return cfg?.nodeVersion;
    },
  });

  if (followsCanonicalRollup) {
    const getLatestVersion = async () => {
      const version = (await registry.getRollupVersions()).at(-1);
      return version !== undefined ? String(version) : undefined;
    };
    const currentVersion = await getLatestVersion();
    if (currentVersion !== undefined) {
      checks.push({
        name: 'rollup',
        currentVersion,
        getLatestVersion,
      });
    }
  }

  const checker = new VersionChecker(checks, 600_000, logger);
  checker.on('newVersion', ({ name, latestVersion, currentVersion }) => {
    if (isShuttingDown()) {
      return;
    }

    logger.warn(`New ${name} version available`, { latestVersion, currentVersion });
  });
  checker.start();
  signalHandlers.push(() => checker.stop());
}

export function stringifyConfig(config: object): string {
  return Object.entries(config)
    .map(([key, value]) => `${key}=${jsonStringify(value)}`)
    .join(' ');
}
