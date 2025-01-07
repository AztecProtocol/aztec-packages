import { readFile } from 'fs/promises';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import pako from 'pako';

function getCurrentDir() {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  } else {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return dirname(fileURLToPath(import.meta.url));
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchCode(multithreaded: boolean) {
  const path = getCurrentDir() + '/../../barretenberg-threads.wasm.gz';
  const compressedData = await readFile(path);
  const decompressedData = pako.ungzip(new Uint8Array(compressedData));
  return decompressedData.buffer;
}
