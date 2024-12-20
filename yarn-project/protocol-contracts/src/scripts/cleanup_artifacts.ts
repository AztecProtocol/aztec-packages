import { fileURLToPath } from '@aztec/foundation/url';

import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';

async function cleanupArtifacts(target: string) {
  const files = await readdir(target);
  for (const file of files) {
    if (!file.endsWith('.json')) {
      continue;
    }
    const fileData = JSON.parse((await readFile(join(target, file), 'utf8')).toString());
    fileData.file_map = {};
    fileData.debug_symbols = {};
    await writeFile(join(target, file), JSON.stringify(fileData));
  }
}

await cleanupArtifacts(fileURLToPath(new URL('../../artifacts', import.meta.url).href));
