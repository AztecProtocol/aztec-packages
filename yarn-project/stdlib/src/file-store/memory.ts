import { writeFile } from 'fs/promises';
import { promisify } from 'util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'zlib';

import type { FileStore, FileStoreSaveOptions } from './interface.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

// Backing data is shared per namespace so that a store created for writing and a (read-only) store
// created later from the same `mem://` URL observe the same files — mirroring how two `file://`
// stores over the same directory share state on disk. Without this, `FileStoreTxSource`, which
// builds its own store from the URL, would never see what a test wrote through a different instance.
const namespaces = new Map<string, Map<string, Buffer>>();

/**
 * In-memory {@link FileStore}, addressed via `mem://<namespace>/...`. Reads and writes are synchronous
 * map operations with no disk I/O, so it is deterministic — useful for tests that exercise consumers
 * of a file store (e.g. the tx file store) rather than the on-disk store itself, where a real
 * filesystem can introduce timing flakes.
 */
export class InMemoryFileStore implements FileStore {
  private readonly files: Map<string, Buffer>;

  constructor(private readonly namespace: string) {
    let files = namespaces.get(namespace);
    if (!files) {
      files = new Map();
      namespaces.set(namespace, files);
    }
    this.files = files;
  }

  /** Clears all in-memory file store data, or a single namespace. Intended for test isolation. */
  static clear(namespace?: string): void {
    if (namespace === undefined) {
      namespaces.clear();
    } else {
      namespaces.delete(namespace);
    }
  }

  public async save(path: string, data: Buffer, opts?: FileStoreSaveOptions): Promise<string> {
    const toStore = opts?.compress ? await gzip(data) : data;
    const key = this.key(path);
    this.files.set(key, Buffer.from(toStore));
    return `mem://${this.namespace}/${key}`;
  }

  public async upload(destPath: string, srcPath: string, opts?: FileStoreSaveOptions): Promise<string> {
    const { readFile } = await import('fs/promises');
    return this.save(destPath, await readFile(srcPath), opts);
  }

  public async read(pathOrUrl: string): Promise<Buffer> {
    const data = this.files.get(this.key(pathOrUrl));
    if (data === undefined) {
      throw new Error(`File not found in memory store: ${pathOrUrl}`);
    }
    // Match LocalFileStore: transparently gunzip content that was stored compressed.
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      return await gunzip(data);
    }
    return data;
  }

  public async download(pathOrUrl: string, destPath: string): Promise<void> {
    await writeFile(destPath, await this.read(pathOrUrl));
  }

  public exists(pathOrUrl: string): Promise<boolean> {
    return Promise.resolve(this.files.has(this.key(pathOrUrl)));
  }

  /** Lists stored file keys, optionally restricted to those under `prefix`. Not part of {@link FileStore}. */
  public listFiles(prefix = ''): string[] {
    const keys = [...this.files.keys()];
    const normalizedPrefix = prefix.replace(/^\/+/, '');
    return normalizedPrefix ? keys.filter(k => k.startsWith(normalizedPrefix)) : keys;
  }

  /** Resolves a relative path or a `mem://` URI (as returned by `save`) to the registry key. */
  private key(pathOrUrl: string): string {
    const ownPrefix = `mem://${this.namespace}/`;
    if (pathOrUrl.startsWith(ownPrefix)) {
      return pathOrUrl.slice(ownPrefix.length);
    }
    if (pathOrUrl.startsWith('mem://')) {
      // A mem:// URI for some namespace: drop the scheme and the leading namespace segment.
      return pathOrUrl.slice('mem://'.length).replace(/^[^/]*\//, '');
    }
    return pathOrUrl.replace(/^\/+/, '');
  }
}
