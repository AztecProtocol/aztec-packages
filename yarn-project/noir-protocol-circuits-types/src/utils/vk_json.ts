import { Fr, VerificationKeyAsFields, VerificationKeyData } from '@aztec/circuits.js';

interface VkJson {
  keyAsBytes: string;
  keyAsFields: string[];
  vkHash: string;
}

export function keyJsonToVKData(json: VkJson): VerificationKeyData {
  const { keyAsBytes, keyAsFields, vkHash } = json;
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      keyAsFields.map((str: string) => Fr.fromHexString(str)),
      Fr.fromHexString(vkHash),
    ),
    Buffer.from(keyAsBytes, 'hex'),
  );
}
