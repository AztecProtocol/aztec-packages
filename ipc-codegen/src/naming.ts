/**
 * Shared naming utilities for code generators
 */

/**
 * Convert camelCase or PascalCase to snake_case
 * @example toSnakeCase("Blake2s") -> "blake2s"
 * @example toSnakeCase("poseidonHash") -> "poseidon_hash"
 */
export function toSnakeCase(name: string): string {
  return name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Convert snake_case or camelCase to PascalCase. Interior capitals are
 * preserved so the mapping does not destroy information.
 * @example toPascalCase("blake2s") -> "Blake2s"
 * @example toPascalCase("poseidon_hash") -> "PoseidonHash"
 * @example toPascalCase("treeId") -> "TreeId"
 */
export function toPascalCase(name: string): string {
  if (!name.includes("_")) {
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return name
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * Convert snake_case or PascalCase to camelCase.
 * @example toCamelCase("tree_id") -> "treeId"
 * @example toCamelCase("forkId") -> "forkId"
 */
export function toCamelCase(name: string): string {
  // If no underscores, assume already camelCase (e.g. forkId, classId)
  if (!name.includes("_")) {
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  const pascal = toPascalCase(name);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * Convert a schema alias name into its language type name. Strips a trailing
 * `_t` (uint256_t -> Uint256) and PascalCases the rest, so `fr` -> `Fr`,
 * `secp256k1_fr` -> `Secp256k1Fr`, `uint256_t` -> `Uint256`.
 */
export function toAliasName(name: string): string {
  const trimmed = name.endsWith("_t") ? name.slice(0, -2) : name;
  return toPascalCase(trimmed);
}

/**
 * Deduplicate structs by name, preserving first-seen order. A response can
 * reference a type that was also discovered inline as a field (the schema
 * dedups the second definition to a name string), so the structs and
 * responses maps can hold the same type — it must only be emitted once.
 */
export function dedupeStructsByName<T extends { name: string }>(
  items: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.name)) continue;
    seen.add(item.name);
    out.push(item);
  }
  return out;
}
