import { Fq, Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import { WalletDB } from './wallet_db.js';
import type { AccountType } from './wallet_db.js';

describe('WalletDB', () => {
  let db: WalletDB;

  beforeEach(async () => {
    const store = await openTmpStore('wallet-db-test');
    db = new WalletDB(store, () => {});
  });

  function makeAccountData(type: AccountType = 'schnorr', alias?: string) {
    return {
      type,
      secretKey: Fr.random(),
      salt: Fr.random(),
      signingKey: Fq.random(),
      alias,
    };
  }

  describe('storeAccount / retrieveAccount', () => {
    it('stores and retrieves an account', async () => {
      const address = await AztecAddress.random();
      const data = makeAccountData('schnorr', 'alice');
      await db.storeAccount(address, data);

      const retrieved = await db.retrieveAccount(address);
      expect(retrieved.address.toString()).toEqual(address.toString());
      expect(retrieved.secretKey).toEqual(data.secretKey);
      expect(retrieved.salt).toEqual(data.salt);
      expect(retrieved.type).toEqual('schnorr');
      expect(retrieved.signingKey).toEqual(data.signingKey.toBuffer());
    });

    it('stores account with Buffer signingKey', async () => {
      const address = await AztecAddress.random();
      const signingKey = Buffer.from(Fq.random().toBuffer());
      const data = { ...makeAccountData(), signingKey };
      await db.storeAccount(address, data);

      const retrieved = await db.retrieveAccount(address);
      expect(Buffer.from(retrieved.signingKey)).toEqual(signingKey);
    });

    it('throws when retrieving non-existent account', async () => {
      const address = await AztecAddress.random();
      await expect(db.retrieveAccount(address)).rejects.toThrow('does not exist on this wallet');
    });

    it('stores account without alias', async () => {
      const address = await AztecAddress.random();
      const data = makeAccountData('ecdsasecp256r1', undefined);
      await db.storeAccount(address, data);

      const retrieved = await db.retrieveAccount(address);
      expect(retrieved.type).toEqual('ecdsasecp256r1');
    });
  });

  describe('listAccounts', () => {
    it('returns empty list initially', async () => {
      const accounts = await db.listAccounts();
      expect(accounts).toEqual([]);
    });

    it('lists accounts with aliases', async () => {
      const addr1 = await AztecAddress.random();
      const addr2 = await AztecAddress.random();
      await db.storeAccount(addr1, makeAccountData('schnorr', 'alice'));
      await db.storeAccount(addr2, makeAccountData('ecdsasecp256r1', 'bob'));

      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(2);

      const aliases = accounts.map(a => a.alias).sort();
      expect(aliases).toEqual(['alice', 'bob']);

      const addresses = accounts.map(a => a.item.toString()).sort();
      expect(addresses).toEqual([addr1.toString(), addr2.toString()].sort());
    });

    it('lists accounts without aliases (empty string alias)', async () => {
      const addr = await AztecAddress.random();
      await db.storeAccount(addr, makeAccountData('schnorr', undefined));

      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].alias).toEqual('');
      expect(accounts[0].item.toString()).toEqual(addr.toString());
    });

    it('lists mix of aliased and unaliased accounts', async () => {
      const addrAliased = await AztecAddress.random();
      const addrNoAlias = await AztecAddress.random();
      await db.storeAccount(addrAliased, makeAccountData('schnorr', 'test0'));
      await db.storeAccount(addrNoAlias, makeAccountData('ecdsasecp256k1', undefined));

      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(2);

      const aliased = accounts.find(a => a.item.equals(addrAliased));
      const unaliased = accounts.find(a => a.item.equals(addrNoAlias));
      expect(aliased!.alias).toEqual('test0');
      expect(unaliased!.alias).toEqual('');
    });
  });

  describe('deleteAccount', () => {
    it('deletes account and its alias', async () => {
      const address = await AztecAddress.random();
      await db.storeAccount(address, makeAccountData('schnorr', 'alice'));

      await db.deleteAccount(address);

      await expect(db.retrieveAccount(address)).rejects.toThrow('does not exist');
      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(0);
    });

    it('deletes account without alias', async () => {
      const address = await AztecAddress.random();
      await db.storeAccount(address, makeAccountData('schnorr', undefined));

      await db.deleteAccount(address);

      await expect(db.retrieveAccount(address)).rejects.toThrow('does not exist');
      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(0);
    });

    it('does not affect other accounts', async () => {
      const addr1 = await AztecAddress.random();
      const addr2 = await AztecAddress.random();
      await db.storeAccount(addr1, makeAccountData('schnorr', 'alice'));
      await db.storeAccount(addr2, makeAccountData('schnorr', 'bob'));

      await db.deleteAccount(addr1);

      const accounts = await db.listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].alias).toEqual('bob');
      expect(accounts[0].item.toString()).toEqual(addr2.toString());
    });
  });

  describe('storeSender / listSenders', () => {
    it('returns empty list initially', async () => {
      const senders = await db.listSenders();
      expect(senders).toEqual([]);
    });

    it('stores and lists senders', async () => {
      const addr1 = await AztecAddress.random();
      const addr2 = await AztecAddress.random();
      await db.storeSender(addr1, 'exchange');
      await db.storeSender(addr2, 'bridge');

      const senders = await db.listSenders();
      expect(senders).toHaveLength(2);

      const aliases = senders.map(s => s.alias).sort();
      expect(aliases).toEqual(['bridge', 'exchange']);
    });

    it('senders do not interfere with accounts', async () => {
      const accountAddr = await AztecAddress.random();
      const senderAddr = await AztecAddress.random();
      await db.storeAccount(accountAddr, makeAccountData('schnorr', 'alice'));
      await db.storeSender(senderAddr, 'exchange');

      const accounts = await db.listAccounts();
      const senders = await db.listSenders();
      expect(accounts).toHaveLength(1);
      expect(senders).toHaveLength(1);
      expect(accounts[0].alias).toEqual('alice');
      expect(senders[0].alias).toEqual('exchange');
    });
  });

  describe('atomicity', () => {
    /** Wraps a store so map writes (set or delete) whose key matches `shouldCrash` fail, simulating a crash mid-operation. */
    function crashingStore(store: AztecAsyncKVStore, shouldCrash: (key: string) => boolean): AztecAsyncKVStore {
      const wrapMap = (map: AztecAsyncMap<string, Buffer>): AztecAsyncMap<string, Buffer> =>
        new Proxy(map, {
          get(target, prop) {
            if (prop === 'set' || prop === 'delete') {
              const write = (target[prop] as (key: string, value?: Buffer) => Promise<void>).bind(target);
              return (key: string, value?: Buffer) =>
                shouldCrash(key) ? Promise.reject(new Error('simulated write failure')) : write(key, value);
            }
            const member = Reflect.get(target, prop);
            return typeof member === 'function' ? member.bind(target) : member;
          },
        });
      return new Proxy(store, {
        get(target, prop) {
          if (prop === 'openMap') {
            return (name: string) => wrapMap(target.openMap(name));
          }
          const member = Reflect.get(target, prop);
          return typeof member === 'function' ? member.bind(target) : member;
        },
      });
    }

    it('persists no partial account data when a write fails midway through storeAccount', async () => {
      const store = await openTmpStore('wallet-db-atomicity-test');
      const failingDb = new WalletDB(
        crashingStore(store, key => key.startsWith('signingKey:')),
        () => {},
      );
      const address = await AztecAddress.random();

      await expect(failingDb.storeAccount(address, makeAccountData('schnorr', 'alice'))).rejects.toThrow(
        'simulated write failure',
      );

      // Inspect the same underlying store with a fresh WalletDB: no trace of the account may remain
      const dbAfterCrash = new WalletDB(store, () => {});
      await expect(dbAfterCrash.retrieveAccount(address)).rejects.toThrow('does not exist');
      expect(await dbAfterCrash.listAccounts()).toEqual([]);
      expect(await store.openMap<string, Buffer>('aliases').getAsync('accounts:alice')).toBeUndefined();
    });

    it('deletes no account data when a write fails midway through deleteAccount', async () => {
      const store = await openTmpStore('wallet-db-atomicity-test');
      const db = new WalletDB(store, () => {});
      const address = await AztecAddress.random();
      const data = makeAccountData('schnorr', 'alice');
      await db.storeAccount(address, data);

      // Fail the alias delete, which happens after all the account entry deletes
      const failingDb = new WalletDB(
        crashingStore(store, key => key.startsWith('accounts:')),
        () => {},
      );
      await expect(failingDb.deleteAccount(address)).rejects.toThrow('simulated write failure');

      // Inspect the same underlying store with a fresh WalletDB: the account must be fully intact
      const dbAfterCrash = new WalletDB(store, () => {});
      const retrieved = await dbAfterCrash.retrieveAccount(address);
      expect(retrieved.secretKey).toEqual(data.secretKey);
      expect(retrieved.salt).toEqual(data.salt);
      expect(retrieved.type).toEqual('schnorr');
      expect(retrieved.signingKey).toEqual(data.signingKey.toBuffer());

      const accounts = await dbAfterCrash.listAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].alias).toEqual('alice');
      expect(accounts[0].item.toString()).toEqual(address.toString());
    });
  });

  describe('all account types', () => {
    it.each(['schnorr', 'ecdsasecp256r1', 'ecdsasecp256k1'] as AccountType[])(
      'stores and retrieves %s account',
      async type => {
        const address = await AztecAddress.random();
        const data = makeAccountData(type, `${type}-account`);
        await db.storeAccount(address, data);

        const retrieved = await db.retrieveAccount(address);
        expect(retrieved.type).toEqual(type);
      },
    );
  });
});
