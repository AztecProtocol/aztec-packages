import { fileManagerTestSuite } from './file-manager-test-suite.js';
import { InMemoryFileManager } from './in-memory-file-manager.js';

describe('InMemoryFileManager', () => {
  fileManagerTestSuite(() => new InMemoryFileManager());

  it('can be initialized with a map of files', () => {
    const fm = new InMemoryFileManager({
      '/test.txt': Buffer.from('foo', 'utf-8'),
    });

    expect(fm.hasFileSync('/test.txt')).toBe(true);
    expect(fm.readFileSync('/test.txt', 'utf-8')).toEqual('foo');
  });
});
