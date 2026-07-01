import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';

import { ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR } from '../../oracle_version.js';
import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { LEGACY_ORACLE_REGISTRY, type LegacyOracleEntry } from './legacy_oracle_registry.js';
import { type NamedValue, ORACLE_REGISTRY, type OracleRegistryEntry, makeEntry } from './oracle_registry.js';

export class UnavailableOracleError extends Error {
  constructor(oracleName: string) {
    super(`${oracleName} oracles not available with the current handler`);
  }
}

/**
 * Builds an ACIR callback from the oracle registry and a handler object.
 *
 * Each oracle call is dispatched by matching the oracle name against the registry for serialization, parsing the
 * `aztec_{scope}_{methodName}` convention to resolve the handler, and calling the method directly. Unknown oracle
 * names produce enhanced error messages based on the contract's oracle version.
 */
export function buildACIRCallback(
  handler: OracleHandler,
  registries: {
    real?: Record<string, OracleRegistryEntry>;
    legacy?: Record<string, LegacyOracleEntry>;
  } = {},
): ACIRCallback {
  const { real = ORACLE_REGISTRY, legacy: legacyRegistry = LEGACY_ORACLE_REGISTRY } = registries;
  const target = {} as ACIRCallback;
  for (const [oracleKey, entry] of Object.entries(real)) {
    const { scope, methodName } = parseOracleName(oracleKey, 'Oracle');
    target[oracleKey] = async (...inputs: ACVMField[][]) => {
      assertHandlerSupportsScope(handler, scope);
      const named = entry.deserializeParams(inputs);
      const positional = named.map((p: NamedValue) => p.value);
      const result = await (handler as any)[methodName](...positional);
      return entry.serializeReturn(result);
    };
  }

  // Legacy oracle names: served for contracts compiled against a retired oracle version. Each reuses the current
  // handler of its `modernOracle` and reshapes the wire (params and/or return) back to what the old bytecode expects.
  for (const [legacyKey, legacy] of Object.entries(legacyRegistry)) {
    const { scope } = parseOracleName(legacyKey, 'Legacy oracle');
    if (legacyKey in target) {
      throw new Error(`Legacy oracle "${legacyKey}" collides with a live oracle of the same name in the registry`);
    }
    const modernEntry = real[legacy.modernOracle];
    const { methodName } = parseOracleName(legacy.modernOracle, 'Oracle');
    // Override only the side whose wire changed; inherit the other from the modern entry.
    const paramOverride = legacy.params;
    const paramSource = paramOverride ? makeEntry({ params: [...paramOverride.legacyType] }) : modernEntry;
    const returnOverride = legacy.returnType;
    const returnSource = returnOverride ? makeEntry({ returnType: returnOverride.legacyType }) : modernEntry;
    target[legacyKey] = async (...inputs: ACVMField[][]) => {
      assertHandlerSupportsScope(handler, scope);
      const legacyArgs = paramSource.deserializeParams(inputs).map(p => p.value);
      const positional = paramOverride ? paramOverride.mapping(legacyArgs) : legacyArgs;
      const result = await (handler as any)[methodName](...positional);
      return returnSource.serializeReturn(returnOverride ? returnOverride.mapping(result) : result);
    };
  }

  return new Proxy(target, makeUnknownOracleTrap(handler));
}

/** Parses an `aztec_{scope}_{method}` oracle name into its parts, throwing if it doesn't follow the convention. */
function parseOracleName(key: string, label: string): { scope: string; methodName: string } {
  const match = key.match(/^aztec_(\w+?)_(.+)$/);
  if (!match) {
    throw new Error(`${label} "${key}" does not follow the aztec_{scope}_{method} convention`);
  }
  return { scope: match[1], methodName: match[2] };
}

/**
 * Proxy trap for the callback table: a known oracle name passes through; an unknown one throws a diagnostic keyed on
 * the contract's oracle version (version unknown, contract newer than this environment, or a same-version mismatch).
 */
function makeUnknownOracleTrap(handler: OracleHandler): ProxyHandler<ACIRCallback> {
  return {
    get(obj, prop: string) {
      // Own-property check only: `in` would match inherited `Object.prototype` keys (e.g. `constructor`, `toString`)
      // and return the built-in instead of falling through to the unknown-oracle diagnostic below.
      if (Object.hasOwn(obj, prop)) {
        return (obj as Record<string, unknown>)[prop];
      }

      return () => {
        let contractVersion = undefined;
        if ('nonOracleFunctionGetContractOracleVersion' in handler) {
          contractVersion = (
            handler as unknown as NonOracleFunctionGetContractOracleVersion
          ).nonOracleFunctionGetContractOracleVersion();
        }
        if (!contractVersion) {
          throw new Error(
            `Oracle '${prop}' not found and the contract's oracle version is unknown (the version check oracle ` +
              `was not called before '${prop}'). This usually means the contract was not compiled with the ` +
              `#[aztec] macro, which injects the version check as the first oracle call in every private/utility ` +
              `external function. If you're using a custom entry point, ensure assert_compatible_oracle_version() ` +
              `is called before any other oracle calls. See https://docs.aztec.network/errors/8`,
          );
        } else if (contractVersion.minor > ORACLE_VERSION_MINOR) {
          throw new Error(
            `Oracle '${prop}' not found.` +
              ` This usually means the contract requires a newer private execution environment than you have.` +
              ` Upgrade your private execution environment to a compatible version. The contract was compiled with` +
              ` Aztec.nr oracle version ${contractVersion.major}.${contractVersion.minor}, but this private` +
              ` execution environment only supports up to ${ORACLE_VERSION_MAJOR}.${ORACLE_VERSION_MINOR}.` +
              ` See https://docs.aztec.network/errors/8`,
          );
        } else {
          throw new Error(
            `Oracle '${prop}' not found.` +
              ` The contract's oracle version (${contractVersion.major}.${contractVersion.minor}) is compatible` +
              ` with this private execution environment (${ORACLE_VERSION_MAJOR}.${ORACLE_VERSION_MINOR}), so all` +
              ` standard oracles should be available. This could mean the contract was compiled against a modified` +
              ` version of Aztec.nr, or that it references an oracle that does not exist.` +
              ` See https://docs.aztec.network/errors/8`,
          );
        }
      };
    },
  };
}

type OracleHandler = IMiscOracle & (IUtilityExecutionOracle | IPrivateExecutionOracle);

type NonOracleFunctionGetContractOracleVersion = {
  nonOracleFunctionGetContractOracleVersion(): { major: number; minor: number } | undefined;
};

function assertHandlerSupportsScope(handler: OracleHandler, scope: string): void {
  switch (scope) {
    case 'misc':
      if (!('isMisc' in handler)) {
        throw new UnavailableOracleError('Misc');
      }
      break;
    case 'utl':
      if (!('isUtility' in handler)) {
        throw new UnavailableOracleError('Utility');
      }
      break;
    case 'prv':
      if (!('isPrivate' in handler)) {
        throw new UnavailableOracleError('Private');
      }
      break;
    default:
      throw new Error(`Unknown oracle scope: ${scope}`);
  }
}
