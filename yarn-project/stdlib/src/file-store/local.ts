import { access, mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';

import type { FileStore } from './interface.js';

export class LocalFileStore implements FileStore {
  constructor(private readonly basePath: string) {}

  public async save(path: string, data: Buffer): Promise<string> {
    const fullPath = this.getFullPath(path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
    return `file://${fullPath}`;
  }

  public async upload(destPath: string, srcPath: string, _opts: { compress: boolean }): Promise<string> {
    const data = await readFile(srcPath);
    return this.save(destPath, data);
  }

  public read(pathOrUrlStr: string): Promise<Buffer> {
    const fullPath = this.getFullPath(pathOrUrlStr);
    return readFile(fullPath);
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
