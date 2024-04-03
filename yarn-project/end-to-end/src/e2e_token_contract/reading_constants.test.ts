import { ReaderContract } from '@aztec/noir-contracts.js';

import { TestClass } from './test_class.js';

// const { E2E_DATA_PATH: dataPath = './data' } = process.env;

describe('e2e_token_contract', () => {
  const t = new TestClass('reading_constants');
  const { TOKEN_DECIMALS, TOKEN_NAME, TOKEN_SYMBOL } = TestClass;
  // Do not destructure anything mutable.
  const { logger } = t;

  beforeAll(async () => {
    await t.setup();
  });

  beforeEach(async () => {
    await t.snapshotManager.setup();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  afterAll(async () => {
    await t.snapshotManager.teardown();
  });

  const toString = (val: bigint[]) => {
    let str = '';
    for (let i = 0; i < val.length; i++) {
      if (val[i] != 0n) {
        str += String.fromCharCode(Number(val[i]));
      }
    }
    return str;
  };

  describe('Reading constants', () => {
    let reader: ReaderContract;

    beforeAll(async () => {
      await t.snapshotManager.snapshot(
        'reading_constants',
        async () => {
          logger('Deploying ReaderContract...');
          const reader = await ReaderContract.deploy(t.wallets[0]).send().deployed();
          logger(`Deployed ReaderContract to ${reader.address}.`);
          return { readerAddress: reader.address };
        },
        async ({ readerAddress }) => {
          reader = await ReaderContract.at(readerAddress, t.wallets[0]);
          logger(`Reader contract restored to ${readerAddress}.`);
        },
      );
    });

    afterAll(async () => {
      await t.snapshotManager.pop();
    });

    describe('name', () => {
      it('check name private', async () => {
        const name = toString(await t.asset.methods.un_get_name().view());
        expect(name).toBe(TOKEN_NAME);

        await reader.methods.check_name_private(t.asset.address, TOKEN_NAME).send().wait();
        await expect(reader.methods.check_name_private(t.asset.address, 'WRONG_NAME').simulate()).rejects.toThrow(
          'name.is_eq(_what)',
        );
      });

      it('check name public', async () => {
        const name = toString(await t.asset.methods.un_get_name().view());
        expect(name).toBe(TOKEN_NAME);

        await reader.methods.check_name_public(t.asset.address, TOKEN_NAME).send().wait();
        await expect(reader.methods.check_name_public(t.asset.address, 'WRONG_NAME').simulate()).rejects.toThrow(
          'name.is_eq(_what)',
        );
      });
    });

    describe('symbol', () => {
      it('private', async () => {
        const sym = toString(await t.asset.methods.un_get_symbol().view());
        expect(sym).toBe(TOKEN_SYMBOL);

        await reader.methods.check_symbol_private(t.asset.address, TOKEN_SYMBOL).send().wait();

        await expect(reader.methods.check_symbol_private(t.asset.address, 'WRONG_SYMBOL').simulate()).rejects.toThrow(
          "Cannot satisfy constraint 'symbol.is_eq(_what)'",
        );
      });
      it('public', async () => {
        const sym = toString(await t.asset.methods.un_get_symbol().view());
        expect(sym).toBe(TOKEN_SYMBOL);

        await reader.methods.check_symbol_public(t.asset.address, TOKEN_SYMBOL).send().wait();

        await expect(reader.methods.check_symbol_public(t.asset.address, 'WRONG_SYMBOL').simulate()).rejects.toThrow(
          "Failed to solve brillig function, reason: explicit trap hit in brillig 'symbol.is_eq(_what)'",
        );
      });
    });

    describe('decimals', () => {
      it('private', async () => {
        const dec = await t.asset.methods.un_get_decimals().view();
        expect(dec).toBe(TOKEN_DECIMALS);

        await reader.methods.check_decimals_private(t.asset.address, TOKEN_DECIMALS).send().wait();

        await expect(reader.methods.check_decimals_private(t.asset.address, 99).simulate()).rejects.toThrow(
          "Cannot satisfy constraint 'ret[0] as u8 == what'",
        );
      });

      it('public', async () => {
        const dec = await t.asset.methods.un_get_decimals().view();
        expect(dec).toBe(TOKEN_DECIMALS);

        await reader.methods.check_decimals_public(t.asset.address, TOKEN_DECIMALS).send().wait();

        await expect(reader.methods.check_decimals_public(t.asset.address, 99).simulate()).rejects.toThrow(
          "Failed to solve brillig function, reason: explicit trap hit in brillig 'ret[0] as u8 == what'",
        );
      });
    });
  });
});
