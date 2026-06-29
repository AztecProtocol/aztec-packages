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

  beforeEach(async () => {});

  afterEach(async () => {
    await t.tokenSim.check();
  });

  // Calls private_get_name via simulate and asserts it equals TOKEN_NAME after decoding the compressed string.
  it('check name private', async () => {
    const name = readFieldCompressedString(
      (await t.asset.methods.private_get_name().simulate({ from: t.adminAddress })).result,
    );
    expect(name).toBe(TOKEN_NAME);
  });

  // Calls public_get_name via simulate and asserts it equals TOKEN_NAME after decoding.
  it('check name public', async () => {
    const name = readFieldCompressedString(
      (await t.asset.methods.public_get_name().simulate({ from: t.adminAddress })).result,
    );
    expect(name).toBe(TOKEN_NAME);
  });

  // Calls private_get_symbol via simulate and asserts it equals TOKEN_SYMBOL after decoding.
  it('check symbol private', async () => {
    const sym = readFieldCompressedString(
      (await t.asset.methods.private_get_symbol().simulate({ from: t.adminAddress })).result,
    );
    expect(sym).toBe(TOKEN_SYMBOL);
  });

  // Calls public_get_symbol via simulate and asserts it equals TOKEN_SYMBOL after decoding.
  it('check symbol public', async () => {
    const sym = readFieldCompressedString(
      (await t.asset.methods.public_get_symbol().simulate({ from: t.adminAddress })).result,
    );
    expect(sym).toBe(TOKEN_SYMBOL);
  });

  // Calls private_get_decimals via simulate and asserts it equals TOKEN_DECIMALS (18n).
  it('check decimals private', async () => {
    const { result: dec } = await t.asset.methods.private_get_decimals().simulate({ from: t.adminAddress });
    expect(dec).toBe(TOKEN_DECIMALS);
  });

  // Calls public_get_decimals via simulate and asserts it equals TOKEN_DECIMALS (18n).
  it('check decimals public', async () => {
    const { result: dec } = await t.asset.methods.public_get_decimals().simulate({ from: t.adminAddress });
    expect(dec).toBe(TOKEN_DECIMALS);
  });
});
