import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { promisify } from 'util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'zlib';

import type { FileStore, FileStoreSaveOptions } from './interface.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

export class LocalFileStore implements FileStore {
  constructor(private readonly basePath: string) {}

  public async save(path: string, data: Buffer, opts?: FileStoreSaveOptions): Promise<string> {
    const fullPath = this.getFullPath(path);
    await mkdir(dirname(fullPath), { recursive: true });
    const toWrite = opts?.compress ? await gzip(data) : data;
    await writeFile(fullPath, toWrite);
    return `file://${fullPath}`;
  }

  public async upload(destPath: string, srcPath: string, _opts: { compress: boolean }): Promise<string> {
    const data = await readFile(srcPath);
    return this.save(destPath, data);
  }

  public async read(pathOrUrlStr: string): Promise<Buffer> {
    const fullPath = this.getFullPath(pathOrUrlStr);
    const data = await readFile(fullPath);
    if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
      return await gunzip(data);
    }
    return data;
  }

  public async download(pathOrUrlStr: string, destPath: string): Promise<void> {
    const data = await this.read(pathOrUrlStr);
    const fullPath = this.getFullPath(destPath);
    await writeFile(fullPath, data);
  }

  public exists(pathOrUrlStr: string): Promise<boolean> {
    const fullPath = this.getFullPath(pathOrUrlStr);
    return access(fullPath)
      .then(() => true)
      .catch(() => false);
  }

  private getFullPath(pathOrUrl: string): string {
    if (URL.canParse(pathOrUrl)) {
      return new URL(pathOrUrl).pathname;
    } else {
      return resolve(this.basePath, pathOrUrl);
    }
  }
}
