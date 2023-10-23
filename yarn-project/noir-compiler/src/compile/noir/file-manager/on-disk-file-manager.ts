import { mkdirp } from 'fs-extra';
import { accessSync, createWriteStream, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { Writable } from 'node:stream';

import { FileManager } from './file-manager.js';

/**
 * A file manager that writes file to a specific directory but reads globally.
 */
export class OnDiskFileManager implements FileManager {
  #dataDir: string;

  public constructor(dataDir: string) {
    this.#dataDir = dataDir;
  }

  /**
   * Saves a file to the data directory.
   * @param name - File to save
   * @param stream - File contents
   */
  public async writeFile(name: string, stream: ReadableStream): Promise<void> {
    if (isAbsolute(name)) {
      throw new Error("can't write absolute path");
    }

    const path = this.#getPath(name);
    await mkdirp(dirname(path));
    await stream.pipeTo(Writable.toWeb(createWriteStream(path)));
  }

  /**
   * Reads a file from the disk and returns a buffer
   * @param name - File to read
   * @param encoding - Binary encoding
   */
  public readFileSync(name: string, encoding: 'binary'): Uint8Array;

  /**
   * Reads a file from the disk and returns a string
   * @param name - File to read
   * @param encoding - Encoding to use
   */
  public readFileSync(name: string, encoding: 'utf-8'): string;

  /**
   * Reads a file from the disk
   * @param name - File to read
   * @param encoding - Encoding to use
   */
  public readFileSync(name: string, encoding: 'utf-8' | 'binary'): Uint8Array | string {
    if (encoding === 'binary') {
      const buf = readFileSync(this.#getPath(name));
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }
    return readFileSync(this.#getPath(name), encoding);
  }

  /**
   * Checks if a file exists and is accessible
   * @param name - File to check
   */
  public hasFileSync(name: string): boolean {
    try {
      // TODO check access modes?
      accessSync(this.#getPath(name));
      return true;
    } catch {
      return false;
    }
  }

  public get dataDir() {
    return this.#dataDir;
  }

  #getPath(name: string) {
    return isAbsolute(name) ? name : join(this.#dataDir, name);
  }
}
