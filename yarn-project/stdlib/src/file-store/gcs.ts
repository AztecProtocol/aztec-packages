import { type Logger, createLogger } from '@aztec/foundation/log';

import { File, Storage, type UploadOptions } from '@google-cloud/storage';
import { join } from 'path';

import type { FileStore, FileStoreSaveOptions } from './interface.js';

export class GoogleCloudFileStore implements FileStore {
  private readonly storage: Storage;

  constructor(
    private readonly bucketName: string,
    private readonly basePath: string,
    private readonly log: Logger = createLogger('stdlib:gcs-file-store'),
  ) {
    this.storage = new Storage();
  }

  public async checkCredentials() {
    await this.storage.getServiceAccount();
  }

  public async save(
    path: string,
    data: Buffer,
    opts: FileStoreSaveOptions = { public: false, metadata: {}, compress: false },
  ): Promise<string> {
    const fullPath = this.getFullPath(path);
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(fullPath);
      await file.save(data, { metadata: opts.metadata, gzip: opts.compress });
      return this.handleUploadedFile(file, opts);
    } catch (err: any) {
      throw new Error(`Error saving file to google cloud storage at ${fullPath}: ${err.message ?? err}`);
    }
  }

  public async upload(
    destPath: string,
    srcPath: string,
    opts: FileStoreSaveOptions = { compress: true, public: false, metadata: {} },
  ): Promise<string> {
    const fullPath = this.getFullPath(destPath);
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(fullPath);
      const uploadOpts: UploadOptions = {
        destination: file,
        gzip: opts.compress,
        metadata: opts.metadata,
      };
      await bucket.upload(srcPath, uploadOpts);
      return this.handleUploadedFile(file, opts);
    } catch (err: any) {
      throw new Error(`Error saving file to google cloud storage at ${fullPath}: ${err.message ?? err}`);
    }
  }

  private async handleUploadedFile(file: File, opts: { public?: boolean }): Promise<string> {
    if (opts.public) {
      try {
        if (!(await file.isPublic())) {
          await file.makePublic();
        }
      } catch (err: any) {
        this.log.warn(
          `Error making file ${file.name} public: ${
            err.message ?? err
          }. This is expected if we handle public access at the bucket level.`,
        );
      }
      return file.publicUrl().replaceAll('%2F', '/');
    } else {
      return file.cloudStorageURI.toString();
    }
  }

  public async read(pathOrUrlStr: string): Promise<Buffer> {
    const file = await this.getFileObject(pathOrUrlStr);
    const contents = await file.download();
    return contents[0];
  }

  public async download(pathOrUrlStr: string, destPath: string): Promise<void> {
    const file = await this.getFileObject(pathOrUrlStr);
    await file.download({ destination: destPath });
  }

  public async exists(pathOrUrlStr: string): Promise<boolean> {
    const { bucketName, fullPath } = this.getBucketAndFullPath(pathOrUrlStr);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(fullPath);
    const [exists] = await file.exists();
    return exists;
  }

  private async getFileObject(pathOrUrlStr: string): Promise<File> {
    const { bucketName, fullPath } = this.getBucketAndFullPath(pathOrUrlStr);
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(fullPath);
    if (!(await file.exists())) {
      throw new Error(`File at ${fullPath} in gcs bucket ${bucketName} does not exist`);
    }
    return file;
  }

  private getBucketAndFullPath(pathOrUrlStr: string): { bucketName: string; fullPath: string } {
    if (URL.canParse(pathOrUrlStr)) {
      const url = new URL(pathOrUrlStr);
      // Note that we accept reading from anywhere, not just our bucket
      return { fullPath: url.pathname.replace(/^\/+/, ''), bucketName: url.host };
    } else {
      return { fullPath: this.getFullPath(pathOrUrlStr), bucketName: this.bucketName };
    }
  }

  private getFullPath(path: string): string {
    return this.basePath && this.basePath.length > 0 ? join(this.basePath, path) : path;
  }
}
