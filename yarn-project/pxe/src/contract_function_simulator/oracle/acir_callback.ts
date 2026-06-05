import type { ACIRCallback, ACVMField } from '@aztec/simulator/client';

import { ORACLE_VERSION_MAJOR, ORACLE_VERSION_MINOR } from '../../oracle_version.js';
import type { IMiscOracle, IPrivateExecutionOracle, IUtilityExecutionOracle } from './interfaces.js';
import { ORACLE_REGISTRY, type OracleRegistryEntry } from './oracle_registry.js';

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
export function buildACIRCallback(handler: OracleHandler): ACIRCallback {
  const registry = ORACLE_REGISTRY as Record<string, OracleRegistryEntry>;

  return new Proxy({} as ACIRCallback, {
    get(_, prop: string) {
      const entry = registry[prop];
      if (entry) {
        const match = prop.match(/^aztec_(\w+?)_(.+)$/);
        if (!match) {
          throw new Error(`Oracle name "${prop}" does not follow the aztec_{scope}_{method} convention`);
        }
        const [, scope, methodName] = match;
        return async (...inputs: ACVMField[][]) => {
          assertHandlerSupportsScope(handler, scope);
          const named = entry.deserializeParams(inputs);
          const positional = named.map(p => p.value);
          const result = await (handler as any)[methodName](...positional);
          return entry.serializeReturn(result);
        };
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
  });
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
