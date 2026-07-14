import { createFileStore, createReadOnlyFileStore } from './factory.js';
import { InMemoryFileStore } from './memory.js';

describe('InMemoryFileStore', () => {
  afterEach(() => InMemoryFileStore.clear());

  it('round-trips data read by path and by returned uri', async () => {
    const store = new InMemoryFileStore('ns');
    const data = Buffer.from('foobar');
    const uri = await store.save('dir/test.txt', data);

    expect(uri).toBe('mem://ns/dir/test.txt');
    expect((await store.read('dir/test.txt')).toString()).toBe('foobar');
    expect((await store.read(uri)).toString()).toBe('foobar');
    expect(await store.exists('dir/test.txt')).toBe(true);
    expect(await store.exists('missing.txt')).toBe(false);
  });

  it('transparently gunzips content stored compressed', async () => {
    const store = new InMemoryFileStore('ns');
    const data = Buffer.from('x'.repeat(1000));
    await store.save('c.bin', data, { compress: true });
    expect((await store.read('c.bin')).equals(data)).toBe(true);
  });

  it('throws when reading a missing file', async () => {
    const store = new InMemoryFileStore('ns');
    await expect(store.read('nope.bin')).rejects.toThrow('File not found');
  });

  it('lists files under a prefix', async () => {
    const store = new InMemoryFileStore('ns');
    await store.save('txs/a.bin', Buffer.from('a'));
    await store.save('txs/b.bin', Buffer.from('b'));
    await store.save('other/c.bin', Buffer.from('c'));

    expect(store.listFiles('txs').sort()).toEqual(['txs/a.bin', 'txs/b.bin']);
    expect(store.listFiles()).toHaveLength(3);
  });

  it('shares data across instances of the same namespace', async () => {
    const writer = new InMemoryFileStore('shared');
    await writer.save('f.bin', Buffer.from('hello'));

    // A separate instance over the same namespace sees the write (mirrors two file:// stores over one dir).
    const reader = new InMemoryFileStore('shared');
    expect((await reader.read('f.bin')).toString()).toBe('hello');

    // A different namespace does not.
    const other = new InMemoryFileStore('other');
    expect(await other.exists('f.bin')).toBe(false);
  });

  it('clears a single namespace without affecting others', async () => {
    await new InMemoryFileStore('a').save('f.bin', Buffer.from('a'));
    await new InMemoryFileStore('b').save('f.bin', Buffer.from('b'));

    InMemoryFileStore.clear('a');
    expect(await new InMemoryFileStore('a').exists('f.bin')).toBe(false);
    expect(await new InMemoryFileStore('b').exists('f.bin')).toBe(true);
  });

  it('is created by the factory for mem:// urls and shares the namespace', async () => {
    const writer = await createFileStore('mem://factory-ns');
    await writer.save('f.bin', Buffer.from('viafactory'));

    const reader = await createReadOnlyFileStore('mem://factory-ns');
    expect((await reader.read('f.bin')).toString()).toBe('viafactory');
  });
});
