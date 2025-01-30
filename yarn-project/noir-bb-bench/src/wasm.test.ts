import { jest } from '@jest/globals';
import createDebug from 'debug';

import { proveThenVerifyStack } from './index.js';

createDebug.enable('*');

/* eslint-disable camelcase */

jest.setTimeout(120_000);

// Reinforce that the functions used in the benchmarking app produce a valid proof.
describe('Prover Bench', () => {
  beforeEach(async () => {});

  it('Should generate a verifiable UltraHonk proof', async () => {
    const verifyResult = await proveThenVerifyStack();
    expect(verifyResult).toEqual(true);
  });
});
