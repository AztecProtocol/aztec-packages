import { Fq, Fr } from '../fields/fields.js';
import type { EnvVar } from './env_var.js';
import { SecretValue } from './secret_value.js';

export type { EnvVar };
export { SecretValue };

export interface ConfigMapping {
  env?: EnvVar;
  parseEnv?: (val: string) => any;
  defaultValue?: any;
  printDefault?: (val: any) => string;
  description: string;
  isBoolean?: boolean;
  nested?: Record<string, ConfigMapping>;
  fallback?: EnvVar[];
}

export function isBooleanConfigValue<T>(obj: T, key: keyof T): boolean {
  return typeof obj[key] === 'boolean';
}

export type ConfigMappingsType<T> = Record<keyof T, ConfigMapping>;

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

  // Parse the value if needed
  if (value !== undefined) {
    return parseFunc ? parseFunc(value) : (value as unknown as T);
  }

  // Return default if no env var found
  return defaultValue;
}

export function getConfigFromMappings<T>(configMappings: ConfigMappingsType<T>): T {
  const config = {} as T;

  for (const key in configMappings) {
    const { env, parseEnv, defaultValue, nested, fallback } = configMappings[key];
    if (nested) {
      (config as any)[key] = getConfigFromMappings(nested);
    } else {
      // Use the shared utility function
      (config as any)[key] = getValueFromEnvWithFallback(env, parseEnv, defaultValue, fallback);
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
export function numberConfigHelper(defaultVal: number): Pick<ConfigMapping, 'parseEnv' | 'defaultValue'> {
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
export function floatConfigHelper(defaultVal: number): Pick<ConfigMapping, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => safeParseFloat(val, defaultVal),
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv and default values for a numerical config value.
 * @param defaultVal - The default numerical value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a numerical config value
 */
export function bigintConfigHelper(defaultVal?: bigint): Pick<ConfigMapping, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => {
      if (val === '') {
        return defaultVal;
      }
      return BigInt(val);
    },
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv for an optional numerical config value.
 */
export function optionalNumberConfigHelper(): Pick<ConfigMapping, 'parseEnv'> {
  return {
    parseEnv: (val: string | undefined) => {
      if (val !== undefined && val.length > 0) {
        const parsedValue = parseInt(val);
        return Number.isSafeInteger(parsedValue) ? parsedValue : undefined;
      }
      return undefined;
    },
  };
}

/**
 * Generates parseEnv and default values for a boolean config value.
 * @param defaultVal - The default value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a boolean config value
 */
export function booleanConfigHelper(
  defaultVal = false,
): Required<Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & { parseVal: (val: string) => boolean }> {
  const parse = (val: string | boolean) => (typeof val === 'boolean' ? val : parseBooleanEnv(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultVal,
    isBoolean: true,
  };
}

export function secretValueConfigHelper<T>(parse: (val: string | undefined) => T): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<T>;
  }
> {
  const wrap = (val: string) => new SecretValue(parse(val));
  return {
    parseEnv: wrap,
    parseVal: wrap,
    defaultValue: new SecretValue(parse(undefined)),
    isBoolean: true,
  };
}

/** Parses an env var as boolean. Returns true only if value is 1, true, or TRUE. */
export function parseBooleanEnv(val: string | undefined): boolean {
  return val !== undefined && ['1', 'true', 'TRUE'].includes(val);
}

export function secretStringConfigHelper(): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<string | undefined>;
  }
>;
export function secretStringConfigHelper(defaultValue: string): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<string>;
  }
>;
export function secretStringConfigHelper(defaultValue?: string): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<string | typeof defaultValue>;
  }
> {
  const parse = (val: string) => new SecretValue(val);
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
    isBoolean: true,
  };
}

export function secretFrConfigHelper(): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fr | undefined>;
  }
>;
export function secretFrConfigHelper(defaultValue: Fr): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fr>;
  }
>;
export function secretFrConfigHelper(defaultValue?: Fr): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fr | typeof defaultValue>;
  }
> {
  const parse = (val: string) => new SecretValue(Fr.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: typeof defaultValue ? new SecretValue(defaultValue) : undefined,
    isBoolean: true,
  };
}

export function secretFqConfigHelper(defaultValue: Fq): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fq>;
  }
>;
export function secretFqConfigHelper(): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fq | undefined>;
  }
>;
export function secretFqConfigHelper(defaultValue?: Fq): Required<
  Pick<ConfigMapping, 'parseEnv' | 'defaultValue' | 'isBoolean'> & {
    parseVal: (val: string) => SecretValue<Fq | typeof defaultValue>;
  }
> {
  const parse = (val: string) => new SecretValue(Fq.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: typeof defaultValue !== 'undefined' ? new SecretValue(defaultValue) : undefined,
    isBoolean: true,
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
