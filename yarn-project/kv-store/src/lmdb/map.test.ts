import { describeAztecMap } from '../interfaces/map_test_suite.js';
import { openTmpStore } from './index.js';

describe('LMDBMap', () => {
  describeAztecMap('Sync AztecMap', () => openTmpStore(true));

  describeAztecMap('Async AztecMap', () => Promise.resolve(openTmpStore(true)), true);
});

// TODO: add tests for the maps with size

// describe('LmdbAztecMultiMapWithSize', () => {
//   let db: Database;
//   let map: LmdbAztecMultiMapWithSize<string, string>;

//   beforeEach(() => {
//     db = open({ dupSort: true } as any);
//     map = new LmdbAztecMultiMapWithSize(db, 'test');
//   });

//   it('should be able to delete values', async () => {
//     await map.set('foo', 'bar');
//     await map.set('foo', 'baz');

//     expect(map.size()).toEqual(2);

//     await map.deleteValue('foo', 'bar');

//     expect(map.size()).toEqual(1);
//     expect(map.get('foo')).toEqual('baz');
//   });
