import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

import type { ReadOnlyFileStore } from './interface.js';

export class HttpFileStore implements ReadOnlyFileStore {
  private readonly fetch: typeof fetch;

  constructor(
    private readonly baseUrl: string,
    private readonly log: Logger = createLogger('stdlib:http-file-store'),
  ) {
    this.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      return await retry(
        () => fetch(...args),
        `Fetching ${args[0]}`,
        makeBackoff([1, 1, 3]),
        this.log,
        /*failSilently=*/ true,
      );
    };
  }

  public async read(pathOrUrl: string): Promise<Buffer> {
    const url = this.getUrl(pathOrUrl);
    const response = await this.fetch(url);
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error(`Error fetching file from ${url}: ${response.statusText}`);
    }
  }

  public async download(pathOrUrl: string, destPath: string): Promise<void> {
    const url = this.getUrl(pathOrUrl);
    const response = await this.fetch(url);
    if (response.ok) {
      await mkdir(dirname(destPath), { recursive: true });
      // Typescript complains about Readable.fromWeb, hence the cast
      await finished(Readable.fromWeb(response.body! as any).pipe(createWriteStream(destPath)));
    } else {
      throw new Error(`Error fetching file from ${url}: ${response.statusText}`);
    }
  }

  public async exists(pathOrUrl: string): Promise<boolean> {
    const url = this.getUrl(pathOrUrl);
    const response = await this.fetch(url);
    return response.ok;
  }

  private getUrl(path: string): string {
    return URL.canParse(path) ? path : `${this.baseUrl.replace(/\/$/, '')}/${path}`;
  }
}
