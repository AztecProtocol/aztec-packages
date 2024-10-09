import { Fr } from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { createConsoleLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

import fs from 'fs/promises';
import { join } from 'path';

const log = createConsoleLogger('aztec:autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

function hashVk(keyAsFields: string[]): string {
  const keyAsFrs = keyAsFields.map((str: string) => Fr.fromString(str));
  return poseidon2Hash(keyAsFrs).toString();
}

const main = async () => {
  const files = await fs.readdir(resolveRelativePath('../../artifacts/keys'));
  for (const fileName of files) {
    if (fileName.endsWith('.vk.data.json')) {
      const keyPath = join(resolveRelativePath(`../../artifacts/keys`), fileName);
      const content = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      if (!content.vkHash) {
        const { keyAsFields } = content;
        content.vkHash = hashVk(keyAsFields);
        await fs.writeFile(keyPath, JSON.stringify(content, null, 2));
      }
    }
  }
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
