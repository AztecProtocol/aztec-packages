import pako from 'pako';

// Annoyingly the wasm declares if it's memory is shared or not. So now we need two wasms if we want to be
// able to fallback on "non shared memory" situations.
export async function fetchCode(multithreaded: boolean, wasmPath?: string) {
  let url: string;
  if (wasmPath) {
    const suffix = multithreaded ? '-threads' : '';
    const filePath = wasmPath.split('/').slice(0, -1).join('/');
    const fileNameWithExtensions = wasmPath.split('/').pop();
    const [fileName, ...extensions] = fileNameWithExtensions!.split('.');
    url = `${filePath}/${fileName}${suffix}.${extensions.join('.')}`;
  } else {
    url = multithreaded
      ? (await import(/* webpackIgnore: true */ './barretenberg-threads.js')).default
      : (await import(/* webpackIgnore: true */ './barretenberg.js')).default;
  }
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
