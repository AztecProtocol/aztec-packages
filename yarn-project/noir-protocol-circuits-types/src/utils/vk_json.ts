import {
  Fr,
  VERIFICATION_KEY_LENGTH_IN_FIELDS,
  VerificationKeyAsFields,
  VerificationKeyData,
} from '@aztec/circuits.js';
import { assertLength } from '@aztec/foundation/serialize';

interface VkJson {
  keyAsBytes: string;
  keyAsFields: string[];
}

export function keyJsonToVKData(json: VkJson): VerificationKeyData {
  const { keyAsBytes, keyAsFields } = json;
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      assertLength(
        keyAsFields.map((str: string) => new Fr(Buffer.from(str.slice(2), 'hex'))),
        VERIFICATION_KEY_LENGTH_IN_FIELDS,
      ),
      // TODO(#7410) what should be the vk hash here?
      new Fr(Buffer.from(keyAsFields[0].slice(2), 'hex')),
    ),
    Buffer.from(keyAsBytes, 'hex'),
  );
}
