import type { OracleRegistryEntry } from '../contract_function_simulator/index.js';

/**
 * Extracts a deterministic signature string from an oracle registry (e.g. PXE's `ORACLE_REGISTRY`).
 *
 * Reads the registry where each oracle's wire ABI lives: the ordered parameter names with their `TypeMapping` labels
 * and the return type. The resulting hash is sensitive to parameter, type, and return changes, not just oracle
 * additions and removals.
 *
 * @example
 * // Given a registry like:
 * //   export const ORACLE_REGISTRY = {
 * //     aztec_utl_foo: makeEntry({ params: [{ name: 'a', type: U32 }], returnType: BOOL }),
 * //     aztec_prv_bar: makeEntry(),
 * //   } satisfies Record<string, OracleRegistryEntry>;
 * //
 * // Returns (sorted, newline-joined):
 * //   "aztec_prv_bar(): void\naztec_utl_foo(a: u32): bool"
 */
export function getOracleRegistrySignature(registry: Record<string, OracleRegistryEntry>): string {
  const oracleSignatures = Object.entries(registry).map(([name, entry]) => {
    const paramSignatures = entry.params.map(p => `${p.name}: ${p.type.label}`);
    const returnType = entry.returnType === undefined ? 'void' : entry.returnType.label;
    return `${name}(${paramSignatures.join(', ')}): ${returnType}`;
  });

  oracleSignatures.sort();

  return oracleSignatures.join('\n');
}
