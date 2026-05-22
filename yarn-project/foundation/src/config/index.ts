import { Fq, Fr } from '../curves/bn254/field.js';
import { createConsoleLogger } from '../log/console.js';
import type { EnvVar } from './env_var.js';
import { type NetworkNames, getActiveNetworkName } from './network_name.js';
import { parseBooleanEnv } from './parse-env.js';
import { SecretValue } from './secret_value.js';

export { SecretValue, getActiveNetworkName };
export type { EnvVar, NetworkNames };
export type { NetworkConfig, NetworkConfigMap } from './network_config.js';
export { NetworkConfigMapSchema, NetworkConfigSchema } from './network_config.js';

export interface ConfigMapping<T> {
  env?: EnvVar;
  /** Parse an env-var string into `T`. Throws on invalid input. */
  parseEnv?: (val: string) => T;
  defaultValue?: T;
  printDefault?: (val: any) => string;
  description: string;
  isBoolean?: boolean;
  fallback?: EnvVar[];
  /**
   * List of deprecated env vars that are still supported but will log a warning.
   * These should also be included in the fallback array for parsing.
   */
  deprecatedFallback?: { env: EnvVar; message?: string }[];
}

export function isBooleanConfigValue<T>(obj: T, key: keyof T): boolean {
  return typeof obj[key] === 'boolean';
}

export type ConfigMappingsType<T> = {
  [K in keyof T]-?: ConfigMapping<Required<T>[K]>;
};

/**
 * Shared utility function to get a value from environment variables with fallback support.
 * This can be used by both getConfigFromMappings and CLI utilities.
 *
 * @param env - The primary environment variable name
 * @param fallback - Optional array of fallback environment variable names
 * @param parseFunc - Optional function to parse the environment variable value
 * @param defaultValue - Optional default value to use if no environment variable is set
 * @returns The parsed value from environment variables or the default value
 */
export function getValueFromEnvWithFallback<T>(
  env: EnvVar | undefined,
  parseFunc: ((val: string) => T) | undefined,
  defaultValue: T | undefined,
  fallback?: EnvVar[],
): T | undefined {
  let value: string | undefined;

  // Try primary env var
  if (env) {
    value = process.env[env];
  }

  // If primary not found, try fallbacks
  if (value === undefined && fallback && fallback.length > 0) {
    for (const fallbackEnv of fallback) {
      const fallbackVal = process.env[fallbackEnv];
      if (fallbackVal !== undefined) {
        value = fallbackVal;
        break;
      }
    }
  }

  // Parse the value if needed. Empty strings are treated as "not set".
  if (value !== undefined && value !== '') {
    return parseFunc ? parseFunc(value) : (value as unknown as T);
  }

  // Return default if no env var found
  return defaultValue;
}

export function getConfigFromMappings<T>(configMappings: ConfigMappingsType<T>): T {
  const config = {} as T;

  for (const key in configMappings) {
    const { env, parseEnv, defaultValue, fallback, deprecatedFallback } = configMappings[key];
    try {
      (config as any)[key] = getValueFromEnvWithFallback(env, parseEnv, defaultValue, fallback);
    } catch (e: any) {
      throw new Error(`Failed to parse config '${key}' (env: ${env ?? 'none'}): ${e.message}`);
    }

    if (deprecatedFallback?.length) {
      const userLog = createConsoleLogger('[DEPRECATED]');
      for (const { env: deprecatedEnv, message } of deprecatedFallback) {
        if (process.env[deprecatedEnv]) {
          const warningMessage =
            message ?? `Environment variable ${deprecatedEnv} is deprecated. Please use ${env} instead.`;
          userLog(warningMessage, { deprecatedEnvVar: deprecatedEnv, newEnvVar: env });
        }
      }
    }
  }

  return config;
}

/**
 * Filters out a service's config mappings to exclude certain keys.
 * @param configMappings - The service's config mappings
 * @param keysToFilter - The keys to filter out
 * @returns The filtered config mappings
 */
export function omitConfigMappings<T, K extends keyof T>(
  configMappings: ConfigMappingsType<T>,
  keysToFilter: K[],
): ConfigMappingsType<Omit<T, K>> {
  return Object.fromEntries(
    Object.entries(configMappings).filter(([key]) => !keysToFilter.includes(key as K)),
  ) as ConfigMappingsType<Omit<T, K>>;
}

/**
 * Generates parseEnv and default values for a numerical config value.
 * @param defaultVal - The default numerical value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a numerical config value
 */
export function numberConfigHelper(defaultVal: number): Pick<ConfigMapping<number>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => safeParseNumber(val, defaultVal),
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv and default values for a numerical config value.
 * @param defaultVal - The default numerical value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a numerical config value
 */
export function floatConfigHelper(
  defaultVal: number,
  validationFn?: (val: number) => void,
): Pick<ConfigMapping<number>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string): number => {
      const parsed = safeParseFloat(val, defaultVal);
      validationFn?.(parsed);
      return parsed;
    },
    defaultValue: defaultVal,
  };
}

/**
 * Parses an environment variable to a 0-1 percentage value
 */
export function percentageConfigHelper(defaultVal: number): Pick<ConfigMapping<number>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string): number => {
      const parsed = safeParseFloat(val, defaultVal);
      if (parsed < 0 || parsed > 1) {
        throw new TypeError(`Invalid percentage value: ${parsed} should be between 0 and 1`);
      }

      return parsed;
    },
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv and default values for a numerical config value.
 * @param defaultVal - The default numerical value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a numerical config value
 */
export function bigintConfigHelper(defaultVal: bigint): Pick<ConfigMapping<bigint>, 'parseEnv' | 'defaultValue'>;
export function bigintConfigHelper(): Pick<ConfigMapping<bigint | undefined>, 'parseEnv' | 'defaultValue'>;
export function bigintConfigHelper(
  defaultVal?: bigint,
): Pick<ConfigMapping<bigint | undefined>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => {
      // Handle scientific notation (e.g. "1e+23", "2E23") which BigInt() doesn't accept directly.
      // We parse it losslessly using bigint arithmetic instead of going through float64.
      if (/[eE]/.test(val)) {
        const match = val.match(/^(-?\d+(?:\.(\d+))?)[eE]([+-]?\d+)$/);
        if (!match) {
          throw new Error(`Cannot convert '${val}' to a BigInt`);
        }
        const digits = match[1].replace('.', '');
        const decimalPlaces = match[2]?.length ?? 0;
        const exponent = parseInt(match[3], 10) - decimalPlaces;
        if (exponent < 0) {
          throw new Error(`Cannot convert '${val}' to a BigInt: result is not an integer`);
        }
        return BigInt(digits) * 10n ** BigInt(exponent);
      }
      return BigInt(val);
    },
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv for an optional numerical config value.
 * Empty strings are already handled by getValueFromEnvWithFallback.
 */
export function optionalNumberConfigHelper(): Pick<ConfigMapping<number>, 'parseEnv'> {
  return {
    parseEnv: (val: string) => {
      const parsedValue = parseInt(val);
      if (!Number.isSafeInteger(parsedValue)) {
        throw new Error(`Invalid number: ${val}`);
      }
      return parsedValue;
    },
  };
}

/** Generates parseEnv for an enum-like config value. */
export function enumConfigHelper<T extends string>(
  values: T[],
  defaultValue: NoInfer<T>,
): Pick<ConfigMapping<T>, 'parseEnv' | 'defaultValue'>;
export function enumConfigHelper<T extends string>(
  values: T[],
): Pick<ConfigMapping<T | undefined>, 'parseEnv' | 'defaultValue'>;
export function enumConfigHelper<T extends string>(
  values: T[],
  defaultValue?: NoInfer<T>,
): Pick<ConfigMapping<T | undefined>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => {
      const sanitizedVal = val.trim().toLowerCase();
      if (values.some(v => v.toLowerCase() === sanitizedVal)) {
        return values.find(v => v.toLowerCase() === sanitizedVal)!;
      }
      throw new Error(`Invalid config value '${val}' (must be one of ${values.join(', ')})`);
    },
    defaultValue,
  };
}

/**
 * Generates parseEnv and default values for a boolean config value.
 * @param defaultVal - The default value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a boolean config value
 */
export function booleanConfigHelper(
  defaultVal = false,
): Required<
  Pick<ConfigMapping<boolean>, 'parseEnv' | 'defaultValue' | 'isBoolean'> & { parseVal: (val: string) => boolean }
> {
  const parse = (val: string | boolean) => (typeof val === 'boolean' ? val : parseBooleanEnv(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultVal,
    isBoolean: true,
  };
}

export function secretValueConfigHelper<T>(parse: (val: string | undefined) => T): Pick<
  ConfigMapping<SecretValue<T>>,
  'parseEnv' | 'defaultValue'
> & {
  parseVal: (val: string) => SecretValue<T>;
} {
  const wrap = (val: string) => new SecretValue(parse(val));
  return {
    parseEnv: wrap,
    parseVal: wrap,
    defaultValue: new SecretValue(parse(undefined)),
  };
}

export { parseBooleanEnv } from './parse-env.js';

export function secretStringConfigHelper(): {
  parseEnv: (val: string) => SecretValue<string>;
  parseVal: (val: string) => SecretValue<string>;
  defaultValue: undefined;
};
export function secretStringConfigHelper(defaultValue: string): {
  parseEnv: (val: string) => SecretValue<string>;
  parseVal: (val: string) => SecretValue<string>;
  defaultValue: SecretValue<string>;
};
export function secretStringConfigHelper(defaultValue?: string): {
  parseEnv: (val: string) => SecretValue<string>;
  parseVal: (val: string) => SecretValue<string>;
  defaultValue: SecretValue<string> | undefined;
} {
  const parse = (val: string) => new SecretValue(val);
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
  };
}

export function secretFrConfigHelper(): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: undefined;
};
export function secretFrConfigHelper(defaultValue: Fr): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: SecretValue<Fr>;
};
export function secretFrConfigHelper(defaultValue?: Fr): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: SecretValue<Fr> | undefined;
} {
  const parse = (val: string) => new SecretValue(Fr.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
  };
}

export function secretFqConfigHelper(): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: undefined;
};
export function secretFqConfigHelper(defaultValue: Fq): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: SecretValue<Fq>;
};
export function secretFqConfigHelper(defaultValue?: Fq): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: SecretValue<Fq> | undefined;
} {
  const parse = (val: string) => new SecretValue(Fq.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
  };
}

/**
 * Safely parses a number from a string.
 * If the value is not a number or is not a safe integer, the default value is returned.
 * @param value - The string value to parse
 * @param defaultValue - The default value to return
 * @returns Either parsed value or default value
 */
function safeParseNumber(value: string, defaultValue: number): number {
  const parsedValue = parseInt(value, 10);
  return Number.isSafeInteger(parsedValue) ? parsedValue : defaultValue;
}

/**
 * Safely parses a floating point number from a string.
 * If the value is not a number, the default value is returned.
 * @param value - The string value to parse
 * @param defaultValue - The default value to return
 * @returns Either parsed value or default value
 */
function safeParseFloat(value: string, defaultValue: number): number {
  const parsedValue = parseFloat(value);
  return Number.isNaN(parsedValue) ? defaultValue : parsedValue;
}

/**
 * Picks specific keys from the given configuration mappings.
 *
 * @template T - The type of the full configuration object.
 * @template K - The keys to pick from the configuration object.
 * @param {ConfigMappingsType<T>} configMappings - The full configuration mappings object.
 * @param {K[]} keys - The keys to pick from the configuration mappings.
 * @returns {ConfigMappingsType<Pick<T, K>>} - A new configuration mappings object containing only the specified keys.
 */
export function pickConfigMappings<T, K extends keyof T>(
  configMappings: ConfigMappingsType<T>,
  keys: K[],
): ConfigMappingsType<Pick<T, K>> {
  return Object.fromEntries(keys.map(key => [key, configMappings[key]])) as ConfigMappingsType<Pick<T, K>>;
}

/**
 * Extracts the default configuration values from the given configuration mappings.
 *
 * @template T - The type of the configuration object.
 * @param {ConfigMappingsType<T>} configMappings - The configuration mappings object.
 * @returns {T} - The configuration object with default values.
 */
export function getDefaultConfig<T>(configMappings: ConfigMappingsType<T>): T {
  const defaultConfig = {} as T;

  for (const key in configMappings) {
    if (configMappings[key] && configMappings[key].defaultValue !== undefined) {
      (defaultConfig as any)[key] = configMappings[key].defaultValue;
    }
  }

  return defaultConfig;
}
