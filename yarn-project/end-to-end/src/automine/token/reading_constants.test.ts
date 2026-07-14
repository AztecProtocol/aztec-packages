import { readFieldCompressedString } from '@aztec/aztec.js/utils';

import { TokenContractTest } from './token_contract_test.js';

// Verifies that Token contract constants (name, symbol, decimals) are readable from both private and public
// entry points and match the values supplied at deploy time. Setup: single node with AutomineSequencer,
// Token contract deployed with TOKEN_NAME/SYMBOL/DECIMALS.
describe('automine/token/reading_constants', () => {
  const t = new TokenContractTest('reading_constants');
  const { TOKEN_DECIMALS, TOKEN_NAME, TOKEN_SYMBOL } = TokenContractTest;

  beforeAll(async () => {
    t.applyBaseSnapshots();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Each constant (name/symbol/decimals) is exposed by both a private and a public getter. Name and symbol
  // are compressed strings that need decoding; decimals is a plain field.
  it.each<{ label: string; get: () => Promise<string | bigint>; expected: string | bigint }>([
    {
      label: 'name via private getter',
      get: async () =>
        readFieldCompressedString((await t.asset.methods.private_get_name().simulate({ from: t.adminAddress })).result),
      expected: TOKEN_NAME,
    },
    {
      label: 'name via public getter',
      get: async () =>
        readFieldCompressedString((await t.asset.methods.public_get_name().simulate({ from: t.adminAddress })).result),
      expected: TOKEN_NAME,
    },
    {
      label: 'symbol via private getter',
      get: async () =>
        readFieldCompressedString(
          (await t.asset.methods.private_get_symbol().simulate({ from: t.adminAddress })).result,
        ),
      expected: TOKEN_SYMBOL,
    },
    {
      label: 'symbol via public getter',
      get: async () =>
        readFieldCompressedString(
          (await t.asset.methods.public_get_symbol().simulate({ from: t.adminAddress })).result,
        ),
      expected: TOKEN_SYMBOL,
    },
    {
      label: 'decimals via private getter',
      get: async () => (await t.asset.methods.private_get_decimals().simulate({ from: t.adminAddress })).result,
      expected: TOKEN_DECIMALS,
    },
    {
      label: 'decimals via public getter',
      get: async () => (await t.asset.methods.public_get_decimals().simulate({ from: t.adminAddress })).result,
      expected: TOKEN_DECIMALS,
    },
  ])('reads $label', async ({ get, expected }) => {
    expect(await get()).toBe(expected);
  });
});
