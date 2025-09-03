import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { createWriteStream, existsSync } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { dirname } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

import type { ReadOnlyFileStore } from './interface.js';

// Configuration constants
const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB
const MAX_PARALLEL_DOWNLOADS = 3;
const BASE_TIMEOUT = 30000; // 30 seconds
const LARGE_FILE_TIMEOUT_MULTIPLIER = 10; // 5 minutes for large files
const PROGRESS_LOG_INTERVAL = 10 * 1024 * 1024; // Log progress every 10MB

interface DownloadProgress {
  bytesDownloaded: number;
  totalBytes: number;
  filePath: string;
  startTime: number;
}

interface FileMetadata {
  size: number;
  etag?: string;
  lastModified?: string;
}

export class HttpFileStore implements ReadOnlyFileStore {
  private readonly axiosInstance: AxiosInstance;
  private readonly fetch: <T>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>;
  private readonly activeDownloads = new Map<string, Promise<void>>();

  constructor(
    private readonly baseUrl: string,
    private readonly log: Logger = createLogger('stdlib:http-file-store'),
  ) {
    this.axiosInstance = axios.create({
      timeout: BASE_TIMEOUT,
      maxRedirects: 5,
    });

    this.fetch = async <T>(config: AxiosRequestConfig) => {
      const fileSize = await this.getFileSize(config.url!);
      const isLargeFile = fileSize && fileSize > LARGE_FILE_THRESHOLD;
      const timeout = isLargeFile ? BASE_TIMEOUT * LARGE_FILE_TIMEOUT_MULTIPLIER : BASE_TIMEOUT;

      const backoffStrategy = isLargeFile ? makeBackoff([2, 5, 10, 30, 60]) : makeBackoff([1, 1, 3]);

      return await retry(
        () => this.axiosInstance.request<T>({ ...config, timeout }),
        `Fetching ${config.url}`,
        backoffStrategy,
        this.log,
        /*failSilently=*/ true,
      );
    };
  }

  private async getFileSize(url: string): Promise<number | undefined> {
    try {
      const response = await this.axiosInstance.head(url, { timeout: 10000 });
      const contentLength = response.headers['content-length'] || response.headers['x-goog-stored-content-length'];
      return contentLength ? parseInt(contentLength, 10) : undefined;
    } catch {
      return undefined;
    }
  }

  private async getFileMetadata(url: string): Promise<FileMetadata | undefined> {
    try {
      const response = await this.axiosInstance.head(url, { timeout: 10000 });
      const contentLength = response.headers['content-length'] || response.headers['x-goog-stored-content-length'];
      return {
        size: contentLength ? parseInt(contentLength, 10) : 0,
        etag: response.headers.etag,
        lastModified: response.headers['last-modified'],
      };
    } catch {
      return undefined;
    }
  }

  private logProgress(progress: DownloadProgress): void {
    const { bytesDownloaded, totalBytes, filePath, startTime } = progress;
    const percentage = totalBytes > 0 ? ((bytesDownloaded / totalBytes) * 100).toFixed(1) : '0.0';
    const elapsed = Date.now() - startTime;
    const speed = elapsed > 0 ? (bytesDownloaded / (elapsed / 1000) / 1024 / 1024).toFixed(2) : '0';

    this.log.verbose(
      `Download progress: ${filePath} - ${percentage}% (${(bytesDownloaded / 1024 / 1024).toFixed(1)}MB/${(totalBytes / 1024 / 1024).toFixed(1)}MB) at ${speed} MB/s`,
    );
  }

  private async downloadWithResume(url: string, destPath: string): Promise<void> {
    let existingSize = 0;
    let totalSize = 0;

    // Check if partial file exists
    if (existsSync(destPath)) {
      try {
        const stats = await stat(destPath);
        existingSize = stats.size;
      } catch {
        existingSize = 0;
      }
    }

    // Get file metadata
    const metadata = await this.getFileMetadata(url);
    if (!metadata) {
      throw new Error(`Cannot get metadata for ${url}`);
    }

    totalSize = metadata.size;

    // If file is already complete, verify integrity
    if (existingSize === totalSize && existingSize > 0) {
      this.log.info(`File already complete: ${destPath} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
      return;
    }

    await mkdir(dirname(destPath), { recursive: true });

    const progress: DownloadProgress = {
      bytesDownloaded: existingSize,
      totalBytes: totalSize,
      filePath: destPath,
      startTime: Date.now(),
    };

    // For resumable downloads, we need range request support
    const headers: Record<string, string> = {};
    if (existingSize > 0) {
      headers.Range = `bytes=${existingSize}-`;
      this.log.info(`Resuming download from byte ${existingSize} for ${destPath}`);
    }

    try {
      const response = await this.axiosInstance.get(url, {
        headers,
        responseType: 'stream',
        timeout: totalSize > LARGE_FILE_THRESHOLD ? BASE_TIMEOUT * LARGE_FILE_TIMEOUT_MULTIPLIER : BASE_TIMEOUT,
      });

      const writeStream = createWriteStream(destPath, { flags: existingSize > 0 ? 'a' : 'w' });
      let lastProgressLog = 0;

      response.data.on('data', (chunk: Buffer) => {
        progress.bytesDownloaded += chunk.length;

        // Log progress at intervals
        if (progress.bytesDownloaded - lastProgressLog >= PROGRESS_LOG_INTERVAL) {
          this.logProgress(progress);
          lastProgressLog = progress.bytesDownloaded;
        }
      });

      await finished(response.data.pipe(writeStream));

      // Final progress log
      this.logProgress(progress);

      // Verify final file size
      const finalStats = await stat(destPath);
      if (finalStats.size !== totalSize) {
        throw new Error(`Download incomplete: expected ${totalSize} bytes, got ${finalStats.size} bytes`);
      }

      this.log.info(`Download completed: ${destPath} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
    } catch (error) {
      // If this was a resume attempt and it failed, try from the beginning
      if (existingSize > 0) {
        this.log.warn(`Resume failed for ${destPath}, restarting from beginning`, error);
        return this.downloadWithResume(url, destPath);
      }
      throw error;
    }
  }

  public async read(pathOrUrl: string): Promise<Buffer> {
    const url = this.getUrl(pathOrUrl);
    try {
      const response = await this.fetch<ArrayBuffer>({ url, method: 'GET', responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error) {
      throw new Error(`Error fetching file from ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async download(pathOrUrl: string, destPath: string): Promise<void> {
    const url = this.getUrl(pathOrUrl);

    // Prevent duplicate downloads of the same file
    if (this.activeDownloads.has(destPath)) {
      this.log.info(`Download already in progress for ${destPath}, waiting...`);
      await this.activeDownloads.get(destPath);
      return;
    }

    const downloadPromise = this.performDownload(url, destPath);
    this.activeDownloads.set(destPath, downloadPromise);

    try {
      await downloadPromise;
    } finally {
      this.activeDownloads.delete(destPath);
    }
  }

  private async performDownload(url: string, destPath: string): Promise<void> {
    const metadata = await this.getFileMetadata(url);
    const isLargeFile = metadata && metadata.size > LARGE_FILE_THRESHOLD;

    if (isLargeFile) {
      this.log.info(`Starting large file download: ${destPath} (${(metadata.size / 1024 / 1024).toFixed(1)}MB)`);

      // Use resumable download with exponential backoff for large files
      await retry(
        () => this.downloadWithResume(url, destPath),
        `Downloading large file ${destPath}`,
        makeBackoff([2, 5, 10, 30, 60]),
        this.log,
        /*failSilently=*/ false,
      );
    } else {
      // Standard download for small files
      try {
        const response = await this.fetch<Readable>({ url, method: 'GET', responseType: 'stream' });
        await mkdir(dirname(destPath), { recursive: true });
        await finished(response.data.pipe(createWriteStream(destPath)));

        if (metadata) {
          this.log.info(`Downloaded: ${destPath} (${(metadata.size / 1024 / 1024).toFixed(1)}MB)`);
        }
      } catch (error) {
        throw new Error(
          `Error downloading file from ${url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  public async exists(pathOrUrl: string): Promise<boolean> {
    const url = this.getUrl(pathOrUrl);
    try {
      await this.axiosInstance.head(url, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  public async downloadMultiple(downloads: Array<{ url: string; destPath: string }>): Promise<void> {
    // Separate large and small files
    const largeFiles: Array<{ url: string; destPath: string; size: number }> = [];
    const smallFiles: Array<{ url: string; destPath: string }> = [];

    // Get metadata for all files to determine size
    await Promise.all(
      downloads.map(async ({ url, destPath }) => {
        const metadata = await this.getFileMetadata(this.getUrl(url));
        if (metadata && metadata.size > LARGE_FILE_THRESHOLD) {
          largeFiles.push({ url, destPath, size: metadata.size });
        } else {
          smallFiles.push({ url, destPath });
        }
      }),
    );

    this.log.info(
      `Download strategy: ${largeFiles.length} large files (sequential), ${smallFiles.length} small files (parallel)`,
    );

    // Download large files sequentially to avoid overwhelming the connection
    for (const { url, destPath, size } of largeFiles.sort((a, b) => b.size - a.size)) {
      this.log.info(`Starting sequential download of large file: ${destPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);
      await this.download(url, destPath);
    }

    // Download small files in parallel with limited concurrency
    const downloadChunks: Array<Array<{ url: string; destPath: string }>> = [];
    for (let i = 0; i < smallFiles.length; i += MAX_PARALLEL_DOWNLOADS) {
      downloadChunks.push(smallFiles.slice(i, i + MAX_PARALLEL_DOWNLOADS));
    }

    for (const chunk of downloadChunks) {
      await Promise.all(chunk.map(({ url, destPath }) => this.download(url, destPath)));
    }
  }

  private getUrl(path: string): string {
    return URL.canParse(path) ? path : `${this.baseUrl.replace(/\/$/, '')}/${path}`;
  }
}
