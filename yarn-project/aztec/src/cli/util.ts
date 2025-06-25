import type { AztecNodeConfig } from '@aztec/aztec-node';
import type { AccountManager, EthAddress, Fr } from '@aztec/aztec.js';
import type { ViemClient } from '@aztec/ethereum';
import type { ConfigMappingsType } from '@aztec/foundation/config';
import { type LogFn, createLogger } from '@aztec/foundation/log';
import type { SharedNodeConfig } from '@aztec/node-lib/config';
import type { PXEService } from '@aztec/pxe/server';
import type { ProverConfig } from '@aztec/stdlib/interfaces/server';
import { UpdateChecker } from '@aztec/stdlib/update-checker';
import { getTelemetryClient } from '@aztec/telemetry-client';

import chalk from 'chalk';
import type { Command } from 'commander';

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
    shutdownPromise = Promise.allSettled(cb).then(() => process.exit(exitCode));
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
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGINT', () => shutdown(logFn, ExitCode.SIGINT, cb));
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGTERM', () => shutdown(logFn, ExitCode.SIGTERM, cb));
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGHUP', () => shutdown(logFn, ExitCode.SIGHUP, cb));
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.once('SIGQUIT', () => shutdown(logFn, ExitCode.SIGQUIT, cb));
};

/**
 * Creates logs for the initial accounts
 * @param accounts - The initial accounts
 * @param pxe - A PXE instance to get the registered accounts
 * @returns A string array containing the initial accounts details
 */
export async function createAccountLogs(
  accountsWithSecretKeys: {
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
  for (const accountWithSecretKey of accountsWithSecretKeys) {
    const completeAddress = await accountWithSecretKey.account.getCompleteAddress();
    if (registeredAccounts.find(a => a.equals(completeAddress))) {
      accountLogStrings.push(` Address: ${completeAddress.address.toString()}\n`);
      accountLogStrings.push(` Partial Address: ${completeAddress.partialAddress.toString()}\n`);
      accountLogStrings.push(` Secret Key: ${accountWithSecretKey.secretKey.toString()}\n`);
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

/**
 * Downloads just enough points to be able to verify ClientIVC proofs.
 * @param opts - Whether proof are to be verifier
 * @param log - Logging function
 */
export async function preloadCrsDataForVerifying(
  { realProofs }: Pick<AztecNodeConfig, 'realProofs'>,
  log: LogFn,
): Promise<void> {
  if (realProofs) {
    const { Crs, GrumpkinCrs } = await import('@aztec/bb.js');
    await Promise.all([Crs.new(2 ** 1, undefined, log), GrumpkinCrs.new(2 ** 16 + 1, undefined, log)]);
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
    await Promise.all([Crs.new(2 ** 25 + 1, undefined, log), GrumpkinCrs.new(2 ** 18 + 1, undefined, log)]);
  }
}

export async function setupUpdateMonitor(
  autoUpdateMode: SharedNodeConfig['autoUpdate'],
  updatesLocation: URL,
  followsCanonicalRollup: boolean,
  publicClient: ViemClient,
  registryContractAddress: EthAddress,
  signalHandlers: Array<() => Promise<void>>,
  updateNodeConfig?: (config: object) => Promise<void>,
) {
  const logger = createLogger('update-check');
  const checker = await UpdateChecker.new({
    baseURL: updatesLocation,
    publicClient,
    registryContractAddress,
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  checker.on('newRollupVersion', async ({ latestVersion, currentVersion }) => {
    if (isShuttingDown()) {
      return;
    }

    // if node follows canonical rollup then this is equivalent to a config update
    if (!followsCanonicalRollup) {
      return;
    }

    if (autoUpdateMode === 'config' || autoUpdateMode === 'config-and-version') {
      logger.info(`New rollup version detected. Please restart the node`, { latestVersion, currentVersion });
      await shutdown(logger.info, ExitCode.ROLLUP_UPGRADE, signalHandlers);
    } else if (autoUpdateMode === 'notify') {
      logger.warn(`New rollup detected. Please restart the node`, { latestVersion, currentVersion });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  checker.on('newNodeVersion', async ({ latestVersion, currentVersion }) => {
    if (isShuttingDown()) {
      return;
    }
    if (autoUpdateMode === 'config-and-version') {
      logger.info(`New node version detected. Please update and restart the node`, { latestVersion, currentVersion });
      await shutdown(logger.info, ExitCode.VERSION_UPGRADE, signalHandlers);
    } else if (autoUpdateMode === 'notify') {
      logger.info(`New node version detected. Please update and restart the node`, { latestVersion, currentVersion });
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  checker.on('updateNodeConfig', async config => {
    if (isShuttingDown()) {
      return;
    }

    if ((autoUpdateMode === 'config' || autoUpdateMode === 'config-and-version') && updateNodeConfig) {
      logger.warn(`Config change detected. Updating node`, config);
      try {
        await updateNodeConfig(config);
      } catch (err) {
        logger.warn('Failed to update config', { err });
      }
    }
    // don't notify on these config changes
  });

  checker.on('updatePublicTelemetryConfig', config => {
    if (autoUpdateMode === 'config' || autoUpdateMode === 'config-and-version') {
      logger.warn(`Public telemetry config change detected. Updating telemetry client`, config);
      try {
        const publicIncludeMetrics: unknown = (config as any).publicIncludeMetrics;
        if (Array.isArray(publicIncludeMetrics) && publicIncludeMetrics.every(m => typeof m === 'string')) {
          getTelemetryClient().setExportedPublicTelemetry(publicIncludeMetrics);
        }
      } catch (err) {
        logger.warn('Failed to update config', { err });
      }
    }
    // don't notify on these config changes
  });

  checker.start();
}
