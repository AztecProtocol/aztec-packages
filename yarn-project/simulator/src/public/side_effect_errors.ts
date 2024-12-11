export class SideEffectLimitReachedError extends Error {
  constructor(sideEffectType: string, limit: number) {
    super(`Reached the limit on number of '${sideEffectType}' side effects: ${limit}`);
    this.name = 'SideEffectLimitReachedError';
  }
}
