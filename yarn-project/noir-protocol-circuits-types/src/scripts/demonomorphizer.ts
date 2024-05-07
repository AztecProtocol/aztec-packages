import {
  type AbiTypeWithGenerics,
  type ArrayType,
  BindingId,
  type Constant,
  type StringType,
  type Struct,
  type StructType,
  type Tuple,
  findAllStructsInType,
  findStructsInType,
} from './abi_type_with_generics.js';

export class Demonomorphizer {
  private variantsMap: Map<string, Struct[]>;
  private visitedStructs: Map<string, StructType>;
  private lastBindingId = 0;

  public static demonomorphize(
    abiTypes: AbiTypeWithGenerics[], // Mutates passed in types
  ) {
    new Demonomorphizer(abiTypes);
  }

  private constructor(private types: AbiTypeWithGenerics[]) {
    this.variantsMap = new Map<string, Struct[]>();
    this.fillVariantsMap();

    this.visitedStructs = new Map<string, StructType>();
    this.demonomorphizeStructs();
  }

  private fillVariantsMap() {
    const allStructs = this.types.flatMap(findAllStructsInType);
    for (const struct of allStructs) {
      const id = Demonomorphizer.buildIdForStruct(struct);
      const variants = this.variantsMap.get(id) ?? [];
      variants.push(struct);
      this.variantsMap.set(id, variants);
    }
  }

  private demonomorphizeStructs() {
    for (const type of this.types) {
      const topLevelStructs = findStructsInType(type);
      for (const struct of topLevelStructs) {
        this.demonomorphizeStruct(struct);
      }
    }
  }

  private demonomorphizeStruct(struct: Struct) {
    const id = Demonomorphizer.buildIdForStruct(struct);
    if (this.visitedStructs.has(id)) {
      return;
    }
    const dependencies = struct.structType.fields.flatMap(field => findStructsInType(field.type));
    for (const dependency of dependencies) {
      this.demonomorphizeStruct(dependency);
    }
    if (this.visitedStructs.has(id)) {
      throw new Error('Circular dependency detected');
    }

    const variants = this.variantsMap.get(id)!;
    const mappedStructType = struct.structType;

    for (let i = 0; i < struct.structType.fields.length; i++) {
      const variantTypes = variants.map(variant => variant.structType.fields[i].type);
      const mappedType = this.unifyTypes(variantTypes, mappedStructType.generics, variants);
      mappedStructType.fields[i].type = mappedType;
    }

    // Mutate variants setting the new struct type
    variants.forEach(variant => (variant.structType = mappedStructType));

    this.visitedStructs.set(id, mappedStructType);
  }

  private unifyTypes(
    types: AbiTypeWithGenerics[],
    generics: BindingId[], // Mutates generics adding new bindings
    variants: Struct[], // mutates variants adding different args to the variants
  ): AbiTypeWithGenerics {
    const kinds = new Set(types.map(type => type.kind));
    if (kinds.size > 1) {
      return this.buildBindingAndPushToVariants(types, generics, variants);
    }
    switch (types[0].kind) {
      case 'field':
      case 'boolean':
      case 'binding':
        return structuredClone(types[0]);
      case 'integer': {
        if (allDeepEqual(types)) {
          return structuredClone(types[0]);
        } else {
          return this.buildBindingAndPushToVariants(types, generics, variants);
        }
      }
      case 'string': {
        const strings = types as StringType[];
        const newString = structuredClone(strings[0]);
        if (strings.every(string => string.length === newString.length)) {
          return newString;
        } else {
          const newStringType: StringType = newString;
          newStringType.length = this.buildNumericBindingAndPushToVariants(
            strings.map(string => {
              if (typeof string.length !== 'number') {
                throw new Error('Trying to unify strings with bindings');
              }
              return string.length;
            }),
            generics,
            variants,
          );
          return newStringType;
        }
      }
      case 'array': {
        const arrays = types as ArrayType[];
        const newArrayType: ArrayType = structuredClone(arrays[0]);
        if (
          !arrays.every(array => {
            return array.length === newArrayType.length;
          })
        ) {
          newArrayType.length = this.buildNumericBindingAndPushToVariants(
            arrays.map(array => {
              if (typeof array.length !== 'number') {
                throw new Error('Trying to unify arrays with bindings');
              }
              return array.length;
            }),
            generics,
            variants,
          );
        }

        newArrayType.type = this.unifyTypes(
          arrays.map(array => array.type),
          generics,
          variants,
        );
        return newArrayType;
      }
      case 'tuple': {
        const tuples = types as Tuple[];
        const newTupleType: Tuple = structuredClone(tuples[0]);
        for (let i = 0; i < newTupleType.fields.length; i++) {
          newTupleType.fields[i] = this.unifyTypes(
            tuples.map(tuple => tuple.fields[i]),
            generics,
            variants,
          );
        }
        return newTupleType;
      }
      case 'struct': {
        const structs = types as Struct[];
        const ids = new Set(structs.map(Demonomorphizer.buildIdForStruct));
        if (ids.size > 1) {
          return this.buildBindingAndPushToVariants(types, generics, variants);
        } else {
          const newStruct = structuredClone(structs[0]);

          if (!structs.every(struct => struct.args.length === structs[0].args.length)) {
            throw new Error('Same struct with different number of args encountered');
          }
          for (let i = 0; i < newStruct.args.length; i++) {
            const argTypes = structs.map(struct => struct.args[i]);
            newStruct.args[i] = this.unifyTypes(argTypes, generics, variants);
          }
          return newStruct;
        }
      }

      case 'constant': {
        const constants = types as Constant[];
        if (constants.every(constant => constant.value === constants[0].value)) {
          return structuredClone(constants[0]);
        } else {
          return this.buildBindingAndPushToVariants(types, generics, variants, true);
        }
      }

      default: {
        const exhaustiveCheck: never = types[0];
        throw new Error(`Unhandled abi type: ${exhaustiveCheck}`);
      }
    }
  }

  public static buildIdForStruct(struct: Struct): string {
    const name = struct.structType.path.split('::').pop()!;
    const fields = struct.structType.fields.map(field => field.name).join(',');
    return `${name}(${fields})`;
  }

  private buildBindingAndPushToVariants(
    concreteTypes: AbiTypeWithGenerics[],
    generics: BindingId[],
    variants: Struct[],
    isNumeric = false,
  ): AbiTypeWithGenerics {
    const bindingId = new BindingId(this.lastBindingId++, isNumeric);

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      const concreteType = concreteTypes[i];
      variant.args.push(concreteType);
    }

    generics.push(bindingId);
    return { kind: 'binding', id: bindingId };
  }

  private buildNumericBindingAndPushToVariants(
    concreteNumbers: number[],
    generics: BindingId[],
    variants: Struct[],
  ): BindingId {
    const bindingId = new BindingId(this.lastBindingId++, true);

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      variant.args.push({ kind: 'constant', value: concreteNumbers[i] });
    }

    generics.push(bindingId);
    return bindingId;
  }
}

function allDeepEqual<T>(arr: T[]): boolean {
  if (arr.length === 0) {
    return true;
  }
  const first = JSON.stringify(arr[0]);
  for (let i = 0; i < arr.length; i++) {
    if (JSON.stringify(arr[i]) !== first) {
      return false;
    }
  }
  return true;
}
