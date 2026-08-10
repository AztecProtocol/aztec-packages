/** Parameterized hex string type for specific byte lengths */
export type Hex<TByteLength extends number> = `0x${string}` & { readonly _length: TByteLength };

export function hasHexPrefix(str: string): str is `0x${string}` {
  return str.startsWith('0x');
}

export function withoutHexPrefix(str: string): string {
  return hasHexPrefix(str) ? str.slice(2) : str;
}

export function withHexPrefix(str: string): `0x${string}` {
  return hasHexPrefix(str) ? str : `0x${str}`;
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
  return count === 1 || count === 1n ? str : (plural ?? `${str}s`);
}

export function count(count: number | bigint, str: string, plural?: string): string {
  return `${count} ${pluralize(str, count, plural)}`;
}

export function truncate(str: string, length: number = 64): string {
  return str.length > length ? str.slice(0, length) + '...' : str;
}

/** Formats a duration in seconds into a compact human-readable string (e.g. `45s`, `12m`, `2h 5m`). */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}

export function isoDate(date?: Date) {
  return (date ?? new Date()).toISOString().replace(/[-:T]/g, '').replace(/\..+$/, '');
}

export function urlJoin(...args: string[]): string {
  const processed = [];
  for (const arg of args) {
    if (arg.length === 0) {
      continue;
    }

    let start = 0;
    let end = arg.length - 1;

    while (start <= end && arg[start] === '/') {
      start++;
    }
    while (end >= start && arg[end] === '/') {
      end--;
    }

    if (start <= end) {
      processed.push(arg.slice(start, end + 1));
    }
  }
  return processed.join('/');
}
