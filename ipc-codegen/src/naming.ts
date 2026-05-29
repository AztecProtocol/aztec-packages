/**
 * Shared naming utilities for code generators
 */

/**
 * Convert camelCase or PascalCase to snake_case
 * @example toSnakeCase("Blake2s") -> "blake2s"
 * @example toSnakeCase("poseidonHash") -> "poseidon_hash"
 */
export function toSnakeCase(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

/**
 * Convert snake_case to PascalCase
 * @example toPascalCase("blake2s") -> "Blake2s"
 * @example toPascalCase("poseidon_hash") -> "PoseidonHash"
 */
export function toPascalCase(name: string): string {
  // Already PascalCase (no underscores and starts with uppercase)
  if (!name.includes('_') && name[0] === name[0].toUpperCase()) {
    return name;
  }
  return name.split('_').map(part =>
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('');
}
