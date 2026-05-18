import { createConsoleLogger } from '../log/console.js';
import type { EnvVar } from './env_var.js';
import { type NetworkNames, getActiveNetworkName } from './network_name.js';
import {
  parseBigIntEnv,
  parseBooleanEnv,
  parseEnumEnv,
  parseFloatEnv,
  parseIntegerEnv,
  parsePercentageEnv,
  parseStrictIntegerEnv,
} from './parse_env.js';
import { SecretValue } from './secret_value.js';

export { SecretValue, getActiveNetworkName };
export { secretFrConfigHelper, secretFqConfigHelper } from './field_config.js';
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

export const BASE_CONFIG_LAYER_PRIORITY = ['cli', 'env', 'network'] as const;
export type BaseConfigLayerName = (typeof BASE_CONFIG_LAYER_PRIORITY)[number];
export type ResolvedConfigLayerName = BaseConfigLayerName | 'default';

export interface ConfigLayer<T> {
  name: BaseConfigLayerName;
  source: Partial<T>;
}

export interface LayerEntry<T> {
  layer: ResolvedConfigLayerName;
  value: T;
}

export interface ResolvedValue<T> {
  value: T;
  source: ResolvedConfigLayerName;
  envVar?: EnvVar;
  layers: LayerEntry<T>[];
}

export type ResolvedConfig<T> = {
  [K in keyof T]-?: ResolvedValue<Required<T>[K]>;
};

type AnyConfig = Record<string, unknown>;
type AnyConfigMappings = ConfigMappingsType<AnyConfig>;
type ConfigFromMappings<TMappings> = TMappings extends ConfigMappingsType<infer T> ? T : never;
type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends (value: infer I) => void
  ? I
  : never;
type ComposedConfigType<TSources extends readonly AnyConfigMappings[]> = UnionToIntersection<
  ConfigFromMappings<TSources[number]>
>;

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

function assertConfigLayerPriority(layers: ConfigLayer<unknown>[]): void {
  const layerPriorities = new Map(BASE_CONFIG_LAYER_PRIORITY.map((name, priority) => [name, priority]));
  const seenLayers = new Set<BaseConfigLayerName>();
  let lastPriority = -1;

  for (const layer of layers) {
    if (seenLayers.has(layer.name)) {
      throw new Error(`Duplicate config layer '${layer.name}'.`);
    }

    seenLayers.add(layer.name);
    const priority = layerPriorities.get(layer.name)!;
    if (priority < lastPriority) {
      throw new Error(
        `Config layers must be ordered by priority (${BASE_CONFIG_LAYER_PRIORITY.join(' > ')}) from highest to lowest.`,
      );
    }
    lastPriority = priority;
  }
}

export function resolveConfig<T>(configMappings: ConfigMappingsType<T>, layers: ConfigLayer<T>[]): ResolvedConfig<T> {
  assertConfigLayerPriority(layers);
  const resolvedConfig: Partial<ResolvedConfig<T>> = {};

  for (const key of Object.keys(configMappings) as Array<keyof T>) {
    const mapping = configMappings[key];
    const resolvedLayers: LayerEntry<Required<T>[typeof key]>[] = [];

    for (const layer of layers) {
      const layerValue = layer.source[key];
      if (layerValue !== undefined) {
        resolvedLayers.push({
          layer: layer.name,
          value: layerValue as Required<T>[typeof key],
        });
      }
    }

    if (mapping.defaultValue !== undefined) {
      resolvedLayers.push({
        layer: 'default',
        value: mapping.defaultValue as Required<T>[typeof key],
      });
    }

    if (resolvedLayers.length === 0) {
      throw new Error(`Missing required config '${String(key)}' (env: ${mapping.env ?? 'none'})`);
    }

    const winningLayer = resolvedLayers[0];
    resolvedConfig[key] = {
      value: winningLayer.value,
      source: winningLayer.layer,
      envVar: mapping.env,
      layers: resolvedLayers,
    };
  }

  return resolvedConfig as ResolvedConfig<T>;
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
 * Composes multiple config mapping objects into one mapping.
 * Throws when the same config key is declared by different mapping objects.
 */
export function composeConfigMappings<TSources extends readonly AnyConfigMappings[]>(
  ...sources: TSources
): ConfigMappingsType<ComposedConfigType<TSources>> {
  const composedMappings: Record<string, ConfigMapping<unknown>> = {};

  for (const sourceMappings of sources) {
    for (const [key, mapping] of Object.entries(sourceMappings)) {
      if (key in composedMappings) {
        if (composedMappings[key] !== mapping) {
          throw new Error(
            `Duplicate config mapping key '${key}' with a different mapping object while composing config mappings. ` +
              `To share this key across multiple components, extract it into a dedicated mapping object and import that same object in each component using composeConfigMappings rather than redeclaring it.`,
          );
        }
        continue;
      }
      composedMappings[key] = mapping;
    }
  }

  return composedMappings as ConfigMappingsType<ComposedConfigType<TSources>>;
}

/**
 * Generates parseEnv and default values for a numerical config value.
 * @param defaultVal - The default numerical value to use if the environment variable is not set or is invalid
 * @returns Object with parseEnv and default values for a numerical config value
 */
export function numberConfigHelper(defaultVal: number): Pick<ConfigMapping<number>, 'parseEnv' | 'defaultValue'> {
  return {
    parseEnv: (val: string) => parseIntegerEnv(val, defaultVal),
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
      const parsed = parseFloatEnv(val, defaultVal);
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
    parseEnv: (val: string) => parsePercentageEnv(val, defaultVal),
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
    parseEnv: parseBigIntEnv,
    defaultValue: defaultVal,
  };
}

/**
 * Generates parseEnv for an optional numerical config value.
 * Empty strings are already handled by getValueFromEnvWithFallback.
 */
export function optionalNumberConfigHelper(): Pick<ConfigMapping<number>, 'parseEnv'> {
  return {
    parseEnv: parseStrictIntegerEnv,
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
    parseEnv: (val: string) => parseEnumEnv(values, val),
    defaultValue,
  };
}

export {
  parseBigIntEnv,
  parseBooleanEnv,
  parseCommaSeparated,
  parseEnumEnv,
  parseFloatEnv,
  parseIntegerEnv,
  parsePercentageEnv,
  parseStrictIntegerEnv,
} from './parse_env.js';

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
