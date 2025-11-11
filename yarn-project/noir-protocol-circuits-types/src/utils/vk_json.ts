import { Fr } from '@aztec/foundation/fields';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

// Type for VK-only JSON files
interface VkOnlyJson {
  bytes: string;
  fields: string[];
  hash: string;
}

export function abiToVKData(json: NoirCompiledCircuit): VerificationKeyData {
  const { verificationKey } = json;
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      verificationKey.fields.map((str: string) => Fr.fromHexString(str)),
      Fr.fromHexString(verificationKey.hash),
    ),
    Buffer.from(verificationKey.bytes, 'hex'),
  );
}

export function jsonToVKData(json: VkOnlyJson): VerificationKeyData {
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      json.fields.map((str: string) => Fr.fromHexString(str)),
      Fr.fromHexString(json.hash),
    ),
    Buffer.from(json.bytes, 'hex'),
  );
}
