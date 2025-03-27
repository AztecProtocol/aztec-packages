import { type Logger, createLogger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { Readable } from 'stream';
import { finished } from 'stream/promises';

import type { ReadOnlyFileStore } from './interface.js';

export class HttpFileStore implements ReadOnlyFileStore {
  private readonly fetch: typeof fetch;

  constructor(private readonly log: Logger = createLogger('stdlib:http-file-store')) {
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

  public async read(url: string): Promise<Buffer> {
    const response = await this.fetch(url);
    if (response.ok) {
      return Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error(`Error fetching file from ${url}: ${response.statusText}`);
    }
  }

  public async download(url: string, destPath: string): Promise<void> {
    const response = await this.fetch(url);
    if (response.ok) {
      await mkdir(destPath, { recursive: true });
      // Typescript complains about Readable.fromWeb, hence the cast
      await finished(Readable.fromWeb(response.body! as any).pipe(createWriteStream(destPath)));
    } else {
      throw new Error(`Error fetching file from ${url}: ${response.statusText}`);
    }
  }

  public async exists(url: string): Promise<boolean> {
    const response = await this.fetch(url);
    return response.ok;
  }
}
