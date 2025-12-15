import { Fr } from '@aztec/foundation/curves/bn254';
import type { NoirCompiledCircuit } from '@aztec/stdlib/noir';
import { VerificationKeyAsFields, VerificationKeyData } from '@aztec/stdlib/vks';

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
