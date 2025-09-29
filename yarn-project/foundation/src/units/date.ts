export function ethereumTimestampToDate(ethereumTimestamp: bigint | number): Date {
  return new Date(Number(ethereumTimestamp) * 1000);
}

export function dateToEthereumTimestamp(date: Date): bigint {
  return BigInt(Math.floor(date.getTime() / 1000));
}
