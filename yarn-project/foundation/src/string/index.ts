export function hasHexPrefix(str: string): str is `0x${string}` {
  return str.startsWith('0x');
}

export function withoutHexPrefix(str: string): string {
  return hasHexPrefix(str) ? str.slice(2) : str;
}

export function isHex(str: string): boolean {
  return /^(0x)?[0-9a-fA-F]*$/.test(str);
}
