import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

import type { ReadOnlyFileStore } from './interface.js';

export class HttpFileStore implements ReadOnlyFileStore {
  private readonly axiosInstance: AxiosInstance;
  private readonly fetch: <T>(config: AxiosRequestConfig) => Promise<AxiosResponse<T>>;

  constructor(
    private readonly baseUrl: string,
    private readonly log: Logger = createLogger('stdlib:http-file-store'),
  ) {
    this.axiosInstance = axios.create();
    this.fetch = async <T>(config: AxiosRequestConfig) => {
      return await retry(
        () => this.axiosInstance.request<T>(config),
        `Fetching ${config.url}`,
        makeBackoff([1, 1, 3]),
        this.log,
        /*failSilently=*/ true,
      );
    };
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
      const response = await this.fetch<Readable>({ url, method: 'GET', responseType: 'stream' });
      await mkdir(dirname(destPath), { recursive: true });
      await finished(response.data.pipe(createWriteStream(destPath)));
    } catch (error) {
      throw new Error(`Error fetching file from ${url}: ${error instanceof Error ? error.message : String(error)}`);
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
