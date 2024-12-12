import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';
import { AztecMapWithSize, AztecMultiMapWithSize } from '../interfaces/map.js';
import { expect } from 'chai';

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', () => openTmpStore(true));

  describeAztecMap('Async AztecMap', () => Promise.resolve(openTmpStore(true)), true);
});

describe('AztecMultiMapWithSize', () => {
  let map: AztecMultiMapWithSize<string, string>;

  beforeEach(() => {
    const store = openTmpStore(true);
    map = store.openMultiMapWithSize('test');
  });

  it('should be able to delete values', async () => {
    await map.set('foo', 'bar');
    await map.set('foo', 'baz');

    expect(map.size()).to.equal(2);

    await map.deleteValue('foo', 'bar');

    expect(map.size()).to.equal(1);
    expect(map.get('foo')).to.equal('baz');
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
