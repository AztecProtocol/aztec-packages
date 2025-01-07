import barretenbergModule from '../../barretenberg.wasm.gz';
import barretenbergThreadsModule from '../../barretenberg-threads.wasm.gz';
import pako from 'pako';

// Annoyingly the wasm declares if it's memory is shared or not. So now we need two wasms if we want to be
// able to fallback on "non shared memory" situations.
export async function fetchCode(multithreaded: boolean) {
  const res = await fetch(multithreaded ? barretenbergThreadsModule : barretenbergModule);
  const compressedData = await res.arrayBuffer();
  const decompressedData = pako.ungzip(new Uint8Array(compressedData));
  return decompressedData.buffer;
}
