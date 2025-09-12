import { Fr } from '@aztec/foundation/fields';
import { createConsoleLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { hashVK } from '@aztec/stdlib/hash';

import { promises as fs } from 'fs';
import { join } from 'path';

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

const main = async () => {
  const files = await fs.readdir(resolveRelativePath('../../artifacts'));
  for (const fileName of files) {
    if (fileName.endsWith('.json')) {
      const keyPath = join(resolveRelativePath(`../../artifacts`), fileName);
      const content = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      // Check if this has verificationKey field (from noir-protocol-circuits)
      if (content.verificationKey && !content.verificationKey.hash) {
        const { fields } = content.verificationKey;

        content.verificationKey.hash = (await hashVK(fields.map((str: string) => Fr.fromHexString(str)))).toString();
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
