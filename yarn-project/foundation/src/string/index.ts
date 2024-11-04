export function hasHexPrefix(str: string): str is `0x${string}` {
  return str.startsWith('0x');
}
