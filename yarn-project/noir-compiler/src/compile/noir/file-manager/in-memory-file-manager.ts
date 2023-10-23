import { FileManager } from './file-manager.js';

/**
 * An in-memory file manager that allows reading and writing files.
 */
export class InMemoryFileManager implements FileManager {
  #files = new Map<string, Uint8Array>();

  constructor(initFiles: Record<string, Uint8Array> = {}) {
    for (const [name, file] of Object.entries(initFiles)) {
      this.#files.set(name, file);
    }
  }

  hasFileSync(name: string): boolean {
    return this.#files.has(name);
  }

  readFileSync(name: string, encoding: 'binary'): Uint8Array;
  readFileSync(name: string, encoding: 'utf-8'): string;
  readFileSync(name: string, encoding: 'binary' | 'utf-8'): string | Uint8Array {
    const file = this.#files.get(name);
    if (typeof file === 'undefined') {
      throw new Error(`file ${name} not found`);
    }
    if (encoding === 'binary') {
      return file;
    }
    return new TextDecoder().decode(file);
  }

  async writeFile(name: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const chunks: Uint8Array[] = [];
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
    }

    const file = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      file.set(chunk, offset);
      offset += chunk.length;
    }
    this.#files.set(name, file);
  }
}
