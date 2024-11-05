import { readFieldCompressedString } from '@aztec/aztec.js';

import { TokenContractTest } from './token_contract_test.js';

describe('e2e_token_contract reading constants', () => {
  const t = new TokenContractTest('reading_constants');
  const { TOKEN_DECIMALS, TOKEN_NAME, TOKEN_SYMBOL } = TokenContractTest;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.setup();
  });

  afterAll(async () => {
    await t.teardown();
  });

  beforeEach(async () => {});

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it('check name private', async () => {
    const name = readFieldCompressedString(await t.asset.methods.private_get_name().simulate());
    expect(name).toBe(TOKEN_NAME);
  });

  it('check name public', async () => {
    const name = readFieldCompressedString(await t.asset.methods.public_get_name().simulate());
    expect(name).toBe(TOKEN_NAME);
  });

  it('check symbol private', async () => {
    const sym = readFieldCompressedString(await t.asset.methods.private_get_symbol().simulate());
    expect(sym).toBe(TOKEN_SYMBOL);
  });

  it('check symbol public', async () => {
    const sym = readFieldCompressedString(await t.asset.methods.public_get_symbol().simulate());
    expect(sym).toBe(TOKEN_SYMBOL);
  });

  it('check decimals private', async () => {
    const dec = await t.asset.methods.private_get_decimals().simulate();
    expect(dec).toBe(TOKEN_DECIMALS);
  });

  it('check decimals public', async () => {
    const dec = await t.asset.methods.public_get_decimals().simulate();
    expect(dec).toBe(TOKEN_DECIMALS);
  });
});
