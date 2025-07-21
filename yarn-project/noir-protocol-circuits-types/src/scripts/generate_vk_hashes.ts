import { Fr } from '@aztec/foundation/fields';
import { createConsoleLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';
import { hashVK } from '@aztec/stdlib/hash';
import { VerificationKeyData } from '@aztec/stdlib/vks';

import { promises as fs } from 'fs';
import { join } from 'path';

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

async function generateFakeTubeVK(name: string) {
  const tubeVK = VerificationKeyData.makeFakeRollupHonk();
  const tubeVKPath = resolveRelativePath(`../../artifacts/keys/${name}.vk.data.json`);
  await fs.writeFile(
    tubeVKPath,
    JSON.stringify({
      keyAsBytes: tubeVK.keyAsBytes.toString('hex'),
      keyAsFields: tubeVK.keyAsFields.key.map((field: Fr) => field.toString()),
    }),
  );
}

const main = async () => {
  // TODO(#7410) tube VK should have been generated in noir-projects, but since we don't have a limited set of tubes
  // we fake it here.
  await generateFakeTubeVK('private_tube');
  await generateFakeTubeVK('public_tube');

  const files = await fs.readdir(resolveRelativePath('../../artifacts/keys'));
  for (const fileName of files) {
    if (fileName.endsWith('.vk.data.json')) {
      const keyPath = join(resolveRelativePath(`../../artifacts/keys`), fileName);
      const content = JSON.parse(await fs.readFile(keyPath, 'utf-8'));
      if (!content.vkHash) {
        const { keyAsFields } = content;

        content.vkHash = (await hashVK(keyAsFields.map((str: string) => Fr.fromHexString(str)))).toString();
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
