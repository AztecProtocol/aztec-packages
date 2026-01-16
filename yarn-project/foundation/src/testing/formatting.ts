export function toInlineStrArray(arr: { toString: () => string }[]): string {
  return `[${arr.map(f => f.toString()).join(',')}]`;
}
