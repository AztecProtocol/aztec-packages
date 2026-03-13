import { toArray } from '@aztec/foundation/iterable';

import { expect } from 'chai';

import { openTmpStore } from './index.js';
import type { AztecLmdbStore } from './store.js';

describe('AztecLmdbStore', () => {
  let store: AztecLmdbStore;

  beforeEach(() => {
    store = openTmpStore(true);
  });

  afterEach(async () => {
    try {
      await store.delete();
    } catch {
      // Store may already be deleted by the test
    }
  });

  describe('clear', () => {
    it('removes all data from maps', async () => {
      const map = store.openMap<string, string>('test-map');
      await map.set('key1', 'value1');
      await map.set('key2', 'value2');

      expect(map.get('key1')).to.equal('value1');
      expect(map.get('key2')).to.equal('value2');

      await store.clear();

      expect(map.get('key1')).to.be.undefined;
      expect(map.get('key2')).to.be.undefined;
    });

    it('removes all data from multimaps', async () => {
      const multiMap = store.openMultiMap<string, string>('test-multimap');
      await multiMap.set('key1', 'value1');
      await multiMap.set('key1', 'value2');

      const valuesBefore = await toArray(multiMap.getValues('key1'));
      expect(valuesBefore.length).to.be.greaterThan(0);

      await store.clear();

      const valuesAfter = await toArray(multiMap.getValues('key1'));
      expect(valuesAfter).to.deep.equal([]);
    });

    it('removes all data from singletons', async () => {
      const singleton = store.openSingleton<string>('test-singleton');
      await singleton.set('hello');

      expect(singleton.get()).to.equal('hello');

      await store.clear();

      expect(singleton.get()).to.be.undefined;
    });

    it('removes all data from all sub-databases at once', async () => {
      const map = store.openMap<string, string>('test-map');
      const multiMap = store.openMultiMap<string, string>('test-multimap');
      const singleton = store.openSingleton<string>('test-singleton');
      const counter = store.openCounter<string>('test-counter');
      const set = store.openSet<string>('test-set');

      await map.set('mk', 'mv');
      await multiMap.set('mmk', 'mmv');
      await singleton.set('sv');
      await counter.update('ck', 5);
      await set.add('sk');

      await store.clear();

      expect(map.get('mk')).to.be.undefined;
      expect(await toArray(multiMap.getValues('mmk'))).to.deep.equal([]);
      expect(singleton.get()).to.be.undefined;
      expect(counter.get('ck')).to.equal(0);
      expect(set.has('sk')).to.equal(false);
    });

    it('allows writing new data after clear', async () => {
      const map = store.openMap<string, string>('test-map');
      await map.set('key1', 'value1');

      await store.clear();

      await map.set('key2', 'value2');
      expect(map.get('key1')).to.be.undefined;
      expect(map.get('key2')).to.equal('value2');
    });
  });

  describe('drop', () => {
    it('completes without error after populating all sub-databases', async () => {
      const map = store.openMap<string, string>('test-map');
      const multiMap = store.openMultiMap<string, string>('test-multimap');
      const singleton = store.openSingleton<string>('test-singleton');

      await map.set('mk', 'mv');
      await multiMap.set('mmk', 'mmv');
      await singleton.set('sv');

      await store.drop();
    });
  });

  describe('delete', () => {
    it('drops and closes the store without error', async () => {
      const map = store.openMap<string, string>('test-map');
      const multiMap = store.openMultiMap<string, string>('test-multimap');
      const singleton = store.openSingleton<string>('test-singleton');

      await map.set('mk', 'mv');
      await multiMap.set('mmk', 'mmv');
      await singleton.set('sv');

      await store.delete();
    });
  });
});
