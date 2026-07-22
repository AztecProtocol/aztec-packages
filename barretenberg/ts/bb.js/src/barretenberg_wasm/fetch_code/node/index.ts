import { readFile } from 'fs/promises';
import { ungzip } from 'pako';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

function getCurrentDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return dirname(fileURLToPath(import.meta.url));
  }
}

export async function fetchCode(multithreaded: boolean, wasmPath?: string) {
  const path = wasmPath ?? getCurrentDir() + '/../../barretenberg-threads.wasm.gz';
  // Default bb wasm is compressed, but user could point it to a non-compressed version
  const maybeCompressedData = await readFile(path);
  const buffer = new Uint8Array(maybeCompressedData);
  const isGzip =
    // Check magic number
    buffer[0] === 0x1f &&
    buffer[1] === 0x8b &&
    // Check compression method:
    buffer[2] === 0x08;
  if (isGzip) {
    const decompressedData = ungzip(buffer);
    return decompressedData.buffer as unknown as Uint8Array<ArrayBuffer>;
  } else {
    return buffer;
  }
}
