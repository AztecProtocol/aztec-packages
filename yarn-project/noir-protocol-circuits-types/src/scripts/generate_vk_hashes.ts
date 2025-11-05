import { AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { createConsoleLogger } from '@aztec/foundation/log';
import { BufferReader } from '@aztec/foundation/serialize';
import { fileURLToPath } from '@aztec/foundation/url';
import { hashVK } from '@aztec/stdlib/hash';
import { VerificationKeyAsFields } from '@aztec/stdlib/vks';

import { promises as fs } from 'fs';
import { join } from 'path';

const log = createConsoleLogger('autogenerate');

function resolveRelativePath(relativePath: string) {
  return fileURLToPath(new URL(relativePath, import.meta.url).href);
}

async function generateAvmVkHash() {
  const rawBinary = await fs.readFile(resolveRelativePath('../../artifacts/keys/avm.vk'));

  const numFields = rawBinary.length / Fr.SIZE_IN_BYTES;
  if (numFields > AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED) {
    throw new Error('Invalid AVM verification key length');
  }
  const reader = BufferReader.asReader(rawBinary);
  const fieldsArray = reader.readArray(numFields, Fr);

  const fieldsArrayPadded = fieldsArray.concat(
    Array(AVM_V2_VERIFICATION_KEY_LENGTH_IN_FIELDS_PADDED - fieldsArray.length).fill(new Fr(0)),
  );
  const vkAsFields = await VerificationKeyAsFields.fromKey(fieldsArrayPadded);

  await fs.writeFile(
    resolveRelativePath('../../artifacts/keys/avm.vk.json'),
    JSON.stringify(
      {
        bytes: rawBinary.toString('hex'),
        fields: vkAsFields.key.map(field => field.toString()),
        hash: vkAsFields.hash.toString(),
      },
      null,
      2,
    ),
  );
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
  await generateAvmVkHash();
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
