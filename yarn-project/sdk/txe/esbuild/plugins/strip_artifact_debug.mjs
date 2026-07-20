import { readFile } from 'node:fs/promises';

/**
 * Strips `file_map` and per-function `debug_symbols` from bundled contract artifact JSON files.
 * Roughly 75% of each compiled artifact is sourcemaps / file maps used only by
 * `getFunctionDebugMetadata` for error-trace enrichment - stripping these only
 * results in TXE losing the capacity for private-function failure traces against the
 * bundled protocol contracts or the SchnorrAccount artifact.
 *
 * Affects only the artifacts inlined into the bundle (protocol-contracts, standard-contracts, and
 * SchnorrAccount). User contracts loaded at runtime during tests keep their full metadata.
 */
export const stripArtifactDebugPlugin = {
  name: 'strip-artifact-debug',
  setup(build) {
    build.onLoad(
      { filter: /(protocol-contracts\/artifacts|standard-contracts\/artifacts|accounts\/artifacts).*\.json$/ },
      async args => {
        const raw = await readFile(args.path, 'utf-8');
        const json = JSON.parse(raw);
        // `ContractArtifactSchema` (yarn-project/stdlib/src/abi/abi.ts) requires `fileMap` to be a
        // record and `debugSymbols` to be a string, so we zero them out instead of deleting them.
        json.file_map = {};
        if (Array.isArray(json.functions)) {
          for (const fn of json.functions) {
            fn.debug_symbols = '';
          }
        }
        return { contents: JSON.stringify(json), loader: 'json' };
      },
    );
  },
};
