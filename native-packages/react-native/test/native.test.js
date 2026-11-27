// The package's native module and polyfills under Hermes: what `import '@aztec-foundation/react-native'` gives an
// app, minus the TurboModule (the host installs the module itself).
import '../js/index.js';

import { KvService, KvServiceSync } from '@aztec-labs/kv-sqlite';

import { assert, equal, rejects, run, test } from './harness.js';

const { Buffer } = require('buffer');
const native = globalThis.__aztecReactNative;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const utf8 = text => new TextEncoder().encode(text);

test('sha256 matches FIPS 180-4 vectors', () => {
  equal(hex(native.sha256('')), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty');
  equal(hex(native.sha256('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', 'abc');
  equal(
    hex(native.sha256(utf8('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    'two blocks',
  );
  equal(
    hex(native.sha256(new Uint8Array(1000000).fill(0x61))),
    'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    'a million a',
  );
  equal(hex(native.sha256('héllo')), hex(native.sha256(utf8('héllo'))), 'a string hashes as its UTF-8');
});

test('base64 round-trips like Node', () => {
  equal(native.base64Encode(utf8('')), '', 'empty');
  equal(native.base64Encode(utf8('f')), 'Zg==', 'one byte');
  equal(native.base64Encode(utf8('fo')), 'Zm8=', 'two bytes');
  equal(native.base64Encode(utf8('foobar')), 'Zm9vYmFy', 'six bytes');
  equal(native.base64Decode('Zm9vYg=='), utf8('foob'), 'padded');
  equal(native.base64Decode('Zm9v\nYmFy'), utf8('foobar'), 'whitespace skipped');
  equal(native.base64Decode('-_-_'), native.base64Decode('+/+/'), 'URL alphabet');
});

test('UTF-8 decoding replaces invalid sequences, or throws when fatal', () => {
  equal(native.decodeUtf8(utf8('héllo €𝄞')), 'héllo €𝄞', 'valid');
  equal(native.decodeUtf8(new Uint8Array([0x61, 0xff, 0x62])), 'a\ufffdb', 'invalid byte');
  equal(native.decodeUtf8(new Uint8Array([0xe2, 0x82])), '\ufffd', 'truncated');
  equal(native.decodeUtf8(new Uint8Array([0xed, 0xa0, 0x80])), '\ufffd\ufffd\ufffd', 'surrogate');
  equal(native.decodeUtf8(new Uint8Array([0xf0, 0x9f, 0x98, 0x61])), '\ufffda', 'truncated four-byte sequence');
  equal(native.decodeUtf8(new Uint8Array([0xc0, 0xaf])), '\ufffd\ufffd', 'overlong');
  equal(new TextDecoder().decode(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), 'a', 'BOM');
  let threw = false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([0xff]));
  } catch (e) {
    threw = e instanceof TypeError;
  }
  assert(threw, 'a fatal decoder throws a TypeError');
});

test("Buffer's string conversions agree with the buffer package's own", () => {
  const text = 'héllo €𝄞 '.repeat(50);
  const bytes = Buffer.from(text);
  assert(bytes instanceof Buffer, 'from(string) is a Buffer');
  equal(bytes, utf8(text), 'utf8 bytes');
  equal(Buffer.byteLength(text), bytes.length, 'byteLength');
  equal(bytes.toString(), text, 'toString');
  equal(bytes.toString('utf8', 1, 7), new TextDecoder().decode(bytes.subarray(1, 7)), 'toString range');
  const b64 = bytes.toString('base64');
  equal(Buffer.from(b64, 'base64'), bytes, 'base64 round trip');
  equal(Buffer.from('00ff10', 'hex'), [0, 255, 16], 'other encodings untouched');
  equal(Buffer.from([1, 2, 3]).toString('hex'), '010203', 'hex toString');
});

test('subarray is a view, and a Buffer of a Buffer', () => {
  const buf = Buffer.from([1, 2, 3, 4, 5]);
  const sub = buf.subarray(1, -1);
  assert(sub instanceof Buffer, 'Buffer');
  equal(sub, [2, 3, 4], 'contents');
  sub[0] = 9;
  equal(buf[1], 9, 'shares memory');
  equal(buf.subarray(-2), [4, 5], 'negative start');
  equal(buf.subarray(3, 1).length, 0, 'empty');
  equal(new Uint32Array([1, 2, 3]).subarray(1), [2, 3], 'other typed arrays');
  assert(new Uint16Array(4).subarray(2) instanceof Uint16Array, 'keeps the type');
});

test('structuredClone, the Set methods and the other built-ins Hermes lacks', () => {
  const date = new Date(5);
  const cyclic = { a: [1, { b: new Map([[1, new Set([2])]]) }], d: date, u: new Uint8Array([7]) };
  cyclic.self = cyclic;
  const clone = structuredClone(cyclic);
  assert(clone !== cyclic && clone.self === clone, 'cycles');
  equal(clone.a[1].b.get(1), new Set([2]), 'Map and Set');
  assert(clone.d instanceof Date && clone.d.getTime() === 5, 'Date');
  assert(clone.u instanceof Uint8Array && clone.u[0] === 7, 'typed array');
  equal(new Set([1, 2, 3]).intersection(new Set([2, 3, 4])), new Set([2, 3]), 'intersection');
  equal(new Set([1]).union(new Set([2])), new Set([1, 2]), 'union');
  assert(new Set([1]).isSubsetOf(new Set([1, 2])), 'isSubsetOf');
  const { promise, resolve } = Promise.withResolvers();
  resolve(1);
  assert(promise instanceof Promise, 'withResolvers');
  equal(Object.groupBy([1, 2, 3], n => (n % 2 ? 'odd' : 'even')), { odd: [1, 3], even: [2] }, 'groupBy');
  equal([3, 1, 2].toSorted(), [1, 2, 3], 'toSorted');
});

test('getRandomValues fills from the OS', () => {
  const a = crypto.getRandomValues(new Uint8Array(64));
  const b = crypto.getRandomValues(new Uint8Array(64));
  assert(hex(a) !== hex(b), 'differs');
  let threw = false;
  try {
    crypto.getRandomValues(new Uint8Array(65537));
  } catch {
    threw = true;
  }
  assert(threw, 'more than 65536 bytes');
});

test("files in the app's data directory", () => {
  const dir = `${native.dataDir}/files-test`;
  native.removeDirectory(dir);
  equal(native.fileSize(`${dir}/a/b.bin`), -1, 'missing file');
  native.writeFile(`${dir}/a/b.bin`, new Uint8Array([1, 2, 3, 4]));
  equal(native.fileSize(`${dir}/a/b.bin`), 4, 'size');
  equal(native.readFile(`${dir}/a/b.bin`), [1, 2, 3, 4], 'read');
  equal(native.readFile(`${dir}/a/b.bin`, 2), [1, 2], 'read a prefix');
  assert(native.isDirectory(`${dir}/a`), 'made the directory');
  equal(native.listDirectory(dir), ['a'], 'list');
  native.removeFile(`${dir}/a/b.bin`);
  equal(native.listDirectory(`${dir}/a`), [], 'removed');
  native.removeDirectory(dir);
  assert(!native.isDirectory(dir), 'removed the directory');
});

// kv-sqlite, compiled into the module, through its generated client: the package's React Native entry reaches the
// library over JSI.
const key = (fill) => new Uint8Array(32).fill(fill);

test('kv-sqlite stores encrypted with ChaCha20 under the key', async () => {
  const path = `${native.dataDir}/kv-sqlite-test/store.sqlite`;
  const store = await KvService.create();
  await store.init({ path, encryptionKey: key(7) });
  await store.put({ container: 'map:m', key: utf8('k'), value: utf8('xyz') });
  await store.append({ container: 'multimap:mm', key: utf8('k'), values: [utf8('a'), utf8('b'), utf8('a')], unique: true });
  equal((await store.get({ container: 'map:m', keys: [utf8('k'), utf8('absent')] })).values, [{ value: utf8('xyz') }, { value: null }], 'get');
  equal((await store.values({ container: 'multimap:mm', key: utf8('k') })).values, [utf8('a'), utf8('b')], 'deduplicated');
  const { bytes } = await store.export({});
  assert(String.fromCharCode(...bytes.subarray(0, 15)) !== 'SQLite format 3', 'the file is encrypted');
  await store.destroy();

  const wrongKey = await KvService.create();
  await rejects(() => wrongKey.init({ path, encryptionKey: key(8) }), /not a database/, 'wrong key');
  await wrongKey.destroy();

  const reopened = await KvService.create();
  await reopened.init({ path, encryptionKey: key(7) });
  equal((await reopened.count({ container: 'map:m', key: null })).count, 1, 'reopened');
  await reopened.deleteStore({});
  await reopened.destroy();
  equal(native.fileSize(path), -1, 'deleted');
});

test('kv-sqlite instances run concurrently, each on its own thread', async () => {
  const stores = await Promise.all([1, 2, 3].map(() => KvService.create()));
  await Promise.all(stores.map(store => store.init({ path: null, encryptionKey: null })));
  await Promise.all(
    stores.map((store, n) =>
      store.putMany({
        container: 'map:m',
        entries: Array.from({ length: 2000 }, (_, i) => ({ key: utf8(`${n}:${i}`), value: utf8(String(i)) })),
      }),
    ),
  );
  equal(
    await Promise.all(stores.map(async store => (await store.count({ container: 'map:m', key: null })).count)),
    [2000, 2000, 2000],
    'counts',
  );
  await Promise.all(stores.map(store => store.destroy()));
});

test('kv-sqlite answers on the JavaScript thread too', async () => {
  const store = await KvServiceSync.create();
  store.init({ path: null, encryptionKey: null });
  store.put({ container: 'map:m', key: utf8('k'), value: utf8('v') });
  equal(store.get({ container: 'map:m', keys: [utf8('k')] }).values, [{ value: utf8('v') }], 'get');
  store.destroy();
});

run();
