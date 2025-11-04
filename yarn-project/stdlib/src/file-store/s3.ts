import { type Logger, createLogger } from '@aztec/foundation/log';

import {
  GetObjectCommand,
  type GetObjectCommandOutput,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'fs';
import { mkdir, mkdtemp, stat, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { basename, dirname, join } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { createGzip } from 'zlib';

import type { FileStore, FileStoreSaveOptions } from './interface.js';

function normalizeBasePath(path: string): string {
  return path?.replace(/^\/+|\/+$/g, '') ?? '';
}

export class S3FileStore implements FileStore {
  private readonly s3: S3Client;
  private readonly region: string;
  private readonly endpoint?: string;
  private readonly publicBaseUrl?: string;

  constructor(
    private readonly bucketName: string,
    private readonly basePath: string,
    opts: { endpoint?: string; publicBaseUrl?: string },
    private readonly log: Logger = createLogger('stdlib:s3-file-store'),
  ) {
    this.endpoint = opts.endpoint;
    this.region = this.endpoint ? 'auto' : (process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1');
    this.publicBaseUrl = opts.publicBaseUrl;

    const clientOptions: any = {};
    if (this.endpoint) {
      clientOptions.region = 'auto';
      clientOptions.endpoint = this.endpoint;
      clientOptions.forcePathStyle = true;
    } else {
      clientOptions.region = this.region;
    }
    this.s3 = new S3Client(clientOptions);
  }

  public async save(path: string, data: Buffer, opts: FileStoreSaveOptions = {}): Promise<string> {
    const key = this.getFullPath(path);
    const shouldCompress = !!opts.compress;

    const body = shouldCompress ? (await import('zlib')).gzipSync(data) : data;
    const contentLength = body.length;
    const contentType = this.detectContentType(key, shouldCompress);
    const put = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: opts.metadata?.['Cache-control'],
      Metadata: this.extractUserMetadata(opts.metadata),
      ContentLength: contentLength,
    });
    await this.s3.send(put);
    return this.buildReturnedUrl(key, !!opts.public);
  }

  public async upload(destPath: string, srcPath: string, opts: FileStoreSaveOptions = {}): Promise<string> {
    const key = this.getFullPath(destPath);
    const shouldCompress = opts.compress !== false; // default true like GCS impl

    await mkdir(dirname(srcPath), { recursive: true }).catch(() => undefined);
    let contentLength: number | undefined;
    let bodyPath = srcPath;

    // We don't set Content-Encoding and we avoid SigV4 streaming (aws-chunked).
    // With AWS SigV4 streaming uploads (Content-Encoding: aws-chunked[,gzip]), servers require
    // x-amz-decoded-content-length (the size of the decoded payload) and an exact Content-Length
    // that includes chunk metadata. For on-the-fly compression, providing
    // those values without buffering or a pre-pass is impractical. Instead, we pre-gzip to a temp file
    // to know ContentLength up-front and upload the gzipped bytes as-is, omitting Content-Encoding.
    // Reference: AWS SigV4 streaming (chunked upload) requirements —
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-streaming.html
    if (shouldCompress) {
      // Pre-gzip to a temp file so we know the exact length for R2/S3 headers
      const tmpDir = await mkdtemp(join(tmpdir(), 's3-upload-'));
      const gzPath = join(tmpDir, `${basename(srcPath)}.gz`);
      const source = createReadStream(srcPath);
      const gz = createGzip();
      const out = createWriteStream(gzPath);
      try {
        await finished(source.pipe(gz).pipe(out));
        const st = await stat(gzPath);
        contentLength = st.size;
        bodyPath = gzPath;
      } catch (err) {
        // Ensure temp file is removed on failure
        await unlink(gzPath).catch(() => undefined);
        throw err;
      }
    } else {
      const st = await stat(srcPath);
      contentLength = st.size;
      bodyPath = srcPath;
    }

    const bodyStream = createReadStream(bodyPath);
    const contentType = this.detectContentType(key, shouldCompress);
    try {
      const put = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: bodyStream as any,
        ContentType: contentType,
        CacheControl: opts.metadata?.['Cache-control'],
        Metadata: this.extractUserMetadata(opts.metadata),
        // Explicitly set ContentLength so R2 can compute x-amz-decoded-content-length correctly
        ContentLength: contentLength,
      } as any);
      await this.s3.send(put);
    } finally {
      if (shouldCompress && bodyPath !== srcPath) {
        await unlink(bodyPath).catch(() => undefined);
      }
    }
    return this.buildReturnedUrl(key, !!opts.public);
  }

  public async read(pathOrUrlStr: string): Promise<Buffer> {
    const { bucket, key } = this.getBucketAndKey(pathOrUrlStr);
    const out: GetObjectCommandOutput = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const stream = out.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  public async download(pathOrUrlStr: string, destPath: string): Promise<void> {
    const { bucket, key } = this.getBucketAndKey(pathOrUrlStr);
    const out: GetObjectCommandOutput = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    await mkdir(dirname(destPath), { recursive: true });
    const write = createWriteStream(destPath);
    await finished((out.Body as Readable).pipe(write));
  }

  public async exists(pathOrUrlStr: string): Promise<boolean> {
    try {
      const { bucket, key } = this.getBucketAndKey(pathOrUrlStr);
      await this.s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (err: any) {
      const code = err?.$metadata?.httpStatusCode ?? err?.name ?? err?.Code;
      if (code === 404 || code === 'NotFound' || code === 'NoSuchKey') {
        return false;
      }
      this.log.warn(`Error checking existence for ${pathOrUrlStr}: ${err?.message ?? String(err)}`);
      return false;
    }
  }

  private extractUserMetadata(meta?: Record<string, string>): Record<string, string> | undefined {
    if (!meta) {
      return undefined;
    }
    const { ['Cache-control']: _ignored, ...rest } = meta;
    return Object.keys(rest).length ? rest : undefined;
  }

  private detectContentType(key: string, isCompressed: boolean | undefined): string | undefined {
    // Basic content type inference
    const lower = key.toLowerCase();
    if (lower.endsWith('.json') || lower.endsWith('.json.gz')) {
      return 'application/json';
    }
    if (lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.csv') || lower.endsWith('.md')) {
      return 'text/plain; charset=utf-8';
    }
    if (lower.endsWith('.db') || lower.endsWith('.sqlite') || lower.endsWith('.bin')) {
      return 'application/octet-stream';
    }
    if (lower.endsWith('.wasm') || lower.endsWith('.wasm.gz')) {
      return 'application/wasm';
    }
    // If compressed, prefer octet-stream unless known
    if (isCompressed) {
      return 'application/octet-stream';
    }
    return undefined;
  }

  private buildReturnedUrl(key: string, makePublic: boolean): string {
    if (!makePublic) {
      return `s3://${this.bucketName}/${key}`;
    }

    if (this.publicBaseUrl) {
      const base = this.publicBaseUrl.replace(/\/$/, '');
      // key already includes basePath via getFullPath, so do not prefix basePath again
      const full = key.replace(/^\/+/, '');
      return `${base}/${full}`;
    }

    // Try to synthesize a URL from endpoint if available (works for public R2 buckets)
    if (this.endpoint) {
      try {
        const url = new URL(this.endpoint);
        return `https://${this.bucketName}.${url.host}/${key}`;
      } catch {
        // fallthrough
      }
    }

    // Fallback to AWS style URL if region looks valid
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private getBucketAndKey(pathOrUrlStr: string): { bucket: string; key: string } {
    if (URL.canParse(pathOrUrlStr)) {
      const url = new URL(pathOrUrlStr);
      if (url.protocol === 's3:') {
        return { bucket: url.host, key: url.pathname.replace(/^\/+/, '') };
      }
      // For https URLs, try to infer virtual-hosted or path-style
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        // If the URL matches the configured publicBaseUrl host, map back to our bucket and key
        if (this.publicBaseUrl && url.host === new URL(this.publicBaseUrl).host) {
          return { bucket: this.bucketName, key: url.pathname.replace(/^\/+/, '') };
        }
        const hostParts = url.host.split('.');
        if (hostParts.length > 3 && (hostParts[1] === 's3' || hostParts[hostParts.length - 2] === 'r2')) {
          // virtual hosted
          return { bucket: hostParts[0], key: url.pathname.replace(/^\/+/, '') };
        } else if (this.endpoint && url.host === new URL(this.endpoint).host) {
          // path-style at custom endpoint
          const [bucket, ...rest] = url.pathname.replace(/^\/+/, '').split('/');
          return { bucket, key: rest.join('/') };
        }
      }
    }
    // Treat as path
    return { bucket: this.bucketName, key: this.getFullPath(pathOrUrlStr) };
  }

  private getFullPath(path: string): string {
    const base = normalizeBasePath(this.basePath);
    const rel = path.replace(/^\/+/, '');
    return base ? join(base, rel) : rel;
  }
}
