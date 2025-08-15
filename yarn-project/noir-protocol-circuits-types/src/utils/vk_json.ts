import { Fr } from '@aztec/foundation/fields';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

export function abiToVKData(json: NoirCompiledCircuit): VerificationKeyData {
  const { verificationKeyAsBytes, verificationKeyAsFields, verificationKeyHash } = json;
  return new VerificationKeyData(
    new VerificationKeyAsFields(
      verificationKeyAsFields.map((str: string) => Fr.fromHexString(str)),
      Fr.fromHexString(verificationKeyHash),
    ),
    Buffer.from(verificationKeyAsBytes, 'hex'),
  );
}
