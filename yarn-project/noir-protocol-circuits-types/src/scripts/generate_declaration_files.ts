import { fileURLToPath } from '@aztec/foundation/url';

import { readdir, writeFile } from 'fs/promises';
import { join } from 'path';

const contract = `\
import { type NoirCompiledCircuit } from '@aztec/stdlib/noir';
const circuit: NoirCompiledCircuit;
export = circuit;
`;

async function generateDeclarationFor(target: string, content: string) {
  const files = await readdir(target);
  for (const file of files) {
    // guard against running this script twice without cleaning the artifacts/ dir first
    if (!file.endsWith('.json')) {
      continue;
    }
    const name = file.replace('.json', '');
    await writeFile(join(target, `${name}.d.json.ts`), content);
  }
}

// Generate declaration files for contracts
await generateDeclarationFor(fileURLToPath(new URL('../../artifacts', import.meta.url).href), contract);
