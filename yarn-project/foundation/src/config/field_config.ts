import { Fq, Fr } from '../curves/bn254/field.js';
import { SecretValue } from './secret_value.js';

export function secretFrConfigHelper(): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: undefined;
};
export function secretFrConfigHelper(defaultValue: Fr): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: SecretValue<Fr>;
};
export function secretFrConfigHelper(defaultValue?: Fr): {
  parseEnv: (val: string) => SecretValue<Fr>;
  parseVal: (val: string) => SecretValue<Fr>;
  defaultValue: SecretValue<Fr> | undefined;
} {
  const parse = (val: string) => new SecretValue(Fr.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
  };
}

export function secretFqConfigHelper(): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: undefined;
};
export function secretFqConfigHelper(defaultValue: Fq): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: SecretValue<Fq>;
};
export function secretFqConfigHelper(defaultValue?: Fq): {
  parseEnv: (val: string) => SecretValue<Fq>;
  parseVal: (val: string) => SecretValue<Fq>;
  defaultValue: SecretValue<Fq> | undefined;
} {
  const parse = (val: string) => new SecretValue(Fq.fromHexString(val));
  return {
    parseEnv: parse,
    parseVal: parse,
    defaultValue: defaultValue !== undefined ? new SecretValue(defaultValue) : undefined,
  };
}
