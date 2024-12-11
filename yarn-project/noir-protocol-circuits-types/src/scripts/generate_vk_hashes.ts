import { Fr, VerificationKeyData } from '@aztec/circuits.js';
import { hashVK } from '@aztec/circuits.js/hash';
import { createConsoleLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

import { promises as fs } from 'fs';
import { join } from 'path';

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

const main = async () => {
  // TODO(#7410) tube VK should have been generated in noir-projects, but since we don't have a limited set of tubes
  // we fake it here.
  const tubeVK = VerificationKeyData.makeFakeHonk();
  const tubeVKPath = resolveRelativePath('../../artifacts/keys/tube.vk.data.json');
  await fs.writeFile(
    tubeVKPath,
    JSON.stringify({
      keyAsBytes: tubeVK.keyAsBytes.toString('hex'),
      keyAsFields: tubeVK.keyAsFields.key.map((field: Fr) => field.toString()),
    }),
  );

  const files = await fs.readdir(resolveRelativePath('../../artifacts/keys'));
  for (const fileName of files) {
    if (fileName.endsWith('.vk.data.json')) {
      const keyPath = join(resolveRelativePath(`../../artifacts/keys`), fileName);
      const content = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      if (!content.vkHash) {
        const { keyAsFields } = content;

        content.vkHash = hashVK(keyAsFields.map((str: string) => Fr.fromString(str))).toString();
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
