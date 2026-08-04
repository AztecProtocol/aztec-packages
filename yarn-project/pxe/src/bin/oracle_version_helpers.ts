import { readFileSync } from 'fs';

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

/**
 * Reads an integer-valued global constant from a Noir or TypeScript source file.
 *
 * Matches both the Noir form (`pub global NAME: Field = N;`) and the TypeScript form (`export const NAME = N;`). This
 * lets us compare a version constant that is hand-duplicated across the TS and Noir layers (which can't import each
 * other) without depending on either compiler. Only the assignment form `NAME = N` matches, so later usages of the
 * constant are ignored regardless of their order in the file.
 *
 * @param sourcePath - Absolute path to the source file to read.
 * @param name - Name of the global constant whose integer value should be extracted.
 * @returns The integer value assigned to the constant.
 * @throws If the constant's declaration is not found in the file.
 */
export function readNumericGlobal(sourcePath: string, name: string): number {
  const sourceCode = readFileSync(sourcePath, 'utf-8');
  const match = sourceCode.match(new RegExp(`\\b${name}\\s*(?::\\s*\\w+\\s*)?=\\s*(\\d+)`));
  if (!match) {
    throw new Error(`Could not find numeric global '${name}' in ${sourcePath}.`);
  }
  return Number(match[1]);
}
