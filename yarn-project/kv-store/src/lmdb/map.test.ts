import { expect } from 'chai';

import { type AztecMapWithSize, type AztecMultiMapWithSize } from '../interfaces/map.js';
import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', () => openTmpStore(true));

  describeAztecMap('Async AztecMap', () => Promise.resolve(openTmpStore(true)), true);
});

describe('AztecMultiMapWithSize', () => {
  let map: AztecMultiMapWithSize<string, string>;
  let map2: AztecMultiMapWithSize<string, string>;

  beforeEach(() => {
    const store = openTmpStore(true);
    map = store.openMultiMapWithSize('test');
    map2 = store.openMultiMapWithSize('test2');
  });

  it('should be able to delete values', async () => {
    await map.set('foo', 'bar');
    await map.set('foo', 'baz');

    await map2.set('foo', 'bar');
    await map2.set('foo', 'baz');

    expect(map.size()).to.equal(2);
    expect(map2.size()).to.equal(2);

    await map.deleteValue('foo', 'bar');

    expect(map.size()).to.equal(1);
    expect(map.get('foo')).to.equal('baz');

    expect(map2.size()).to.equal(2);
  });
});

describe('AztecMapWithSize', () => {
  let map: AztecMapWithSize<string, string>;

  beforeEach(() => {
    const store = openTmpStore(true);
    map = store.openMapWithSize('test');
  });

  it('should be able to delete values', async () => {
    await map.set('foo', 'bar');
    await map.set('fizz', 'buzz');

    expect(map.size()).to.equal(2);

    await map.delete('foo');

    expect(map.size()).to.equal(1);
    expect(map.get('fizz')).to.equal('buzz');
  });
});
