export class SideEffectLimitReachedError extends Error {
  constructor(sideEffectType: string, limit: number) {
    super(`Reached the limit (${limit}) on number of '${sideEffectType}' per tx`);
    this.name = 'SideEffectLimitReachedError';
  }
}
