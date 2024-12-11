export function hasHexPrefix(str: string): str is `0x${string}` {
  return str.startsWith('0x');
}

export function withoutHexPrefix(str: string): string {
  return hasHexPrefix(str) ? str.slice(2) : str;
}

export function isHex(str: string): boolean {
  return /^(0x)?[0-9a-fA-F]*$/.test(str);
}

export function hexToBuffer(str: string): Buffer {
  return Buffer.from(withoutHexPrefix(str), 'hex');
}

export function bufferToHex(buffer: Buffer): `0x${string}` {
  return `0x${buffer.toString('hex')}`;
}

export function pluralize(str: string, count: number | bigint, plural?: string): string {
  return count === 1 || count === 1n ? str : plural ?? `${str}s`;
}

export function count(count: number | bigint, str: string, plural?: string): string {
  return `${count} ${pluralize(str, count, plural)}`;
}
