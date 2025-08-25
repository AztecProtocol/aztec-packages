import { Fr } from '@aztec/foundation/fields';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

// Type for VK-only JSON files
interface VkOnlyJson {
  verificationKey: {
    bytes: string;
    fields: string[];
    hash: string;
  };
}

export function abiToVKData(json: NoirCompiledCircuit | VkOnlyJson): VerificationKeyData {
  const { verificationKey } = json;
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      verificationKey.fields.map((str: string) => Fr.fromHexString(str)),
      Fr.fromHexString(verificationKey.hash),
    ),
    Buffer.from(verificationKey.bytes, 'hex'),
  );
}
