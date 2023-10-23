import { FileManager } from './file-manager.js';

/**
 * Declare the default test suite for a file manager
 * @param setup - Function to setup a file manager
 * @param teardown - Optional function to call at the end of the test
 */
export function fileManagerTestSuite<T extends FileManager>(
  setup: () => T | Promise<T>,
  teardown?: (fm: T) => void | Promise<void>,
) {
  describe('FileManager', () => {
    let fm: T;
    let testFileContent: string;
    let testFileBytes: Uint8Array;

    beforeEach(async () => {
      fm = await setup();
      testFileContent = 'foo';
      testFileBytes = new TextEncoder().encode(testFileContent);
    });

    afterEach(() => {
      return teardown?.(fm);
    });

    it('saves files and correctly reads bytes back', async () => {
      await fm.writeFile('test.txt', new Blob([testFileBytes]).stream());
      expect(fm.readFileSync('test.txt', 'binary')).toEqual(testFileBytes);
    });

    it('saves files and correctly reads UTF-8 string back', async () => {
      await fm.writeFile('test.txt', new Blob([testFileBytes]).stream());
      expect(fm.readFileSync('test.txt', 'utf-8')).toEqual(testFileContent);
    });

    it('correctly checks if file exists or not', async () => {
      expect(fm.hasFileSync('test.txt')).toBe(false);
      await fm.writeFile('test.txt', new Blob([testFileBytes]).stream());
      expect(fm.hasFileSync('test.txt')).toBe(true);
    });
  });
}
