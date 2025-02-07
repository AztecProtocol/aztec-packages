import pako from 'pako';

// Annoyingly the wasm declares if it's memory is shared or not. So now we need two wasms if we want to be
// able to fallback on "non shared memory" situations.
export async function fetchCode(multithreaded: boolean, wasmPath?: string) {
  const suffix = multithreaded ? '-threads' : '';
  const url = wasmPath
    ? `${wasmPath}/barretenberg${suffix}.wasm.gz`
    : (await import(/* webpackIgnore: true */ `./barretenberg${suffix}.js`)).default;
  const res = await fetch(url);
  const maybeCompressedData = await res.arrayBuffer();
  const buffer = new Uint8Array(maybeCompressedData);
  const isGzip =
    // Check magic number
    buffer[0] === 0x1f &&
    buffer[1] === 0x8b &&
    // Check compression method:
    buffer[2] === 0x08;
  if (isGzip) {
    const decompressedData = pako.ungzip(buffer);
    return decompressedData.buffer;
  } else {
    return buffer;
  }
}
