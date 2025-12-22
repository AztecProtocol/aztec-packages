const simpleTokenArtifactUrl = new URL(
  '../assets/artifacts/simple_token_contract-SimpleToken.json.gz',
  import.meta.url,
).toString();

const decompressGzipToText = async (response: Response): Promise<string> => {
  if (typeof DecompressionStream !== 'undefined') {
    const decompressor = new DecompressionStream('gzip');
    const sourceStream = response.body ?? new Blob([await response.arrayBuffer()]).stream();
    return new Response(sourceStream.pipeThrough(decompressor)).text();
  }

  const { ungzip } = await import('pako');
  const compressed = new Uint8Array(await response.arrayBuffer());
  const decompressed = ungzip(compressed);
  return new TextDecoder().decode(decompressed);
};

export const loadSimpleTokenArtifactJson = async () => {
  const response = await fetch(simpleTokenArtifactUrl);
  if (!response.ok) {
    throw new Error(`Failed to load SimpleToken artifact: ${response.status} ${response.statusText}`);
  }

  const jsonText = await decompressGzipToText(response);
  return JSON.parse(jsonText);
};
