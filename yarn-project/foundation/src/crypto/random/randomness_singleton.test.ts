import { RandomnessSingleton } from './randomness_singleton.js';

describe('RandomnessSingleton', () => {
  it('isDeterministic() is true when SEED is set', () => {
    const rng = RandomnessSingleton.getInstance();
    expect(rng.isDeterministic()).toBe(true);
  });
});
