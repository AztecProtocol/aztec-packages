import { type AbiType } from '@aztec/foundation/abi';

export class BindingId {
  constructor(public id: number, public isNumeric: boolean) {}
}

export type StructType = { path: string; fields: { name: string; type: AbiTypeWithGenerics }[]; generics: BindingId[] };

export type StringType = {
  kind: 'string';
  length: number | BindingId;
};

export type Constant = {
  kind: 'constant';
  value: number;
};

export type ArrayType = {
  kind: 'array';
  length: number | BindingId;
  type: AbiTypeWithGenerics;
};

export type Tuple = {
  kind: 'tuple';
  fields: AbiTypeWithGenerics[];
};

export type Struct = {
  kind: 'struct';
  structType: StructType;
  args: AbiTypeWithGenerics[];
};

export type AbiTypeWithGenerics =
  | { kind: 'field' }
  | { kind: 'boolean' }
  | { kind: 'integer'; sign: string; width: number }
  | { kind: 'binding'; id: BindingId }
  | { kind: 'constant'; value: number }
  | StringType
  | ArrayType
  | Tuple
  | Struct;

export function mapAbiTypeToAbiTypeWithGenerics(abiType: AbiType): AbiTypeWithGenerics {
  switch (abiType.kind) {
    case 'field':
    case 'boolean':
    case 'string':
    case 'integer':
      return abiType;
    case 'array':
      return {
        kind: 'array',
        length: abiType.length,
        type: mapAbiTypeToAbiTypeWithGenerics(abiType.type),
      };
    case 'tuple':
      return {
        kind: 'tuple',
        fields: abiType.fields.map(field => mapAbiTypeToAbiTypeWithGenerics(field)),
      };
    case 'struct': {
      const structType = {
        path: abiType.path,
        fields: abiType.fields.map(field => ({
          name: field.name,
          type: mapAbiTypeToAbiTypeWithGenerics(field.type),
        })),
        generics: [],
      };
      return {
        kind: 'struct',
        structType,
        args: [],
      };
    }
  }
}

export function findStructsInType(abiType: AbiTypeWithGenerics): Struct[] {
  switch (abiType.kind) {
    case 'field':
    case 'boolean':
    case 'string':
    case 'integer':
      return [];
    case 'array':
      return findStructsInType(abiType.type);
    case 'tuple':
      return abiType.fields.flatMap(findStructsInType);
    case 'struct':
      return [abiType];
    default: {
      return [];
    }
  }
}

export function findAllStructsInType(abiType: AbiTypeWithGenerics): Struct[] {
  let allStructs: Struct[] = [];
  let lastStructs = findStructsInType(abiType);
  while (lastStructs.length > 0) {
    allStructs = allStructs.concat(lastStructs);
    lastStructs = lastStructs.flatMap(struct =>
      struct.structType.fields.flatMap(field => findStructsInType(field.type)),
    );
  }
  return allStructs;
}
