import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import type { ReadOnlyFileStore } from './interface.js';

/** Options for configuring HttpFileStore behavior. */
export interface HttpFileStoreOptions {
  /** Retry backoff intervals in seconds. Empty array disables retries. Default: [1, 1, 3]. */
  retryBackoff?: number[];
  /** Request timeout in milliseconds. Default: no timeout (axios default). */
  timeoutMs?: number;
}

export class HttpFileStore implements ReadOnlyFileStore {
  private readonly axiosInstance: AxiosInstance;
  private readonly fetch: <T>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>;

  constructor(
    private readonly baseUrl: string,
    private readonly log: Logger = createLogger('file-store:http'),
    options?: HttpFileStoreOptions,
  ) {
    this.axiosInstance = axios.create({
      ...(options?.timeoutMs !== undefined && { timeout: options.timeoutMs }),
    });

    const retryBackoff = options?.retryBackoff ?? [1, 1, 3];
    if (retryBackoff.length > 0) {
      this.fetch = async <T>(config: AxiosRequestConfig) => {
        return await retry(
          () => this.axiosInstance.request<T>(config),
          `Fetching ${config.url}`,
          makeBackoff(retryBackoff),
          this.log,
          /*failSilently=*/ true,
        );
      };
    } else {
      this.fetch = async <T>(config: AxiosRequestConfig) => {
        return await this.axiosInstance.request<T>(config);
      };
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
    try {
      this.log.debug(`Downloading file from ${url} to ${destPath}`);
      const response = await this.fetch<Readable>({ url, method: 'GET', responseType: 'stream' });
      this.log.debug(`Response ${response.status} (${response.statusText}) from ${url}, writing to ${destPath}`);
      await mkdir(dirname(destPath), { recursive: true });
      await pipeline(response.data, createWriteStream(destPath));
      this.log.debug(`Download of ${url} to ${destPath} complete`);
    } catch (error) {
      throw new Error(`Error fetching file from ${url}`, { cause: error });
    }
  }

  public async exists(pathOrUrl: string): Promise<boolean> {
    const url = this.getUrl(pathOrUrl);
    try {
      await this.fetch<unknown>({ url, method: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  }

  private getUrl(path: string): string {
    return URL.canParse(path) ? path : `${this.baseUrl.replace(/\/$/, '')}/${path}`;
  }
}
