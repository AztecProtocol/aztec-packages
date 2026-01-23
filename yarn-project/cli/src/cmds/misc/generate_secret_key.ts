import { Fr } from '@aztec/aztec.js/fields';

export function generateSecretKey() {
  return { secretKey: Fr.random() };
}
