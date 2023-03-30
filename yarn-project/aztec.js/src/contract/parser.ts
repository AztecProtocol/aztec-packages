import { ContractAbi, ABIType } from '@aztec/aztec-rpc';

export function abiChecker(abi: ContractAbi) {
  if (!abi.functions || abi.functions.length === 0) {
    throw new Error('ABI has no functions');
  }

  abi.functions.forEach(func => {
    if (!('name' in func && typeof func.name === 'string' && func.name.length > 0)) {
      throw new Error('ABI function has no name');
    }

    // TODO: implement a better check for bytecode (right now only checks if it's > 0)
    if (!('bytecode' in func && typeof func.bytecode === 'string' && func.bytecode.length > 0)) {
      throw new Error('ABI function parameter has incorrect bytecode');
    }

    func.parameters.forEach(param => {
      if (!param.type) {
        throw new Error('ABI function parameter has no type');
      }

      abiParameterTypeChecker(param.type);
    });
  });

  // TODO: implement a better check for constructor (right now only checks if it has it or not)
  if (!abi.functions.find(func => func.name === 'constructor')) {
    throw new Error('ABI has no constructor');
  }

  return true;
}

function abiParameterTypeChecker(type: ABIType): boolean {
  switch (type.kind) {
    case 'field':
    case 'boolean':
      return true;
    case 'integer':
      if (!('sign' in type && typeof type.sign === 'string')) {
        throw new Error('ABI function parameter has an incorrectly formed integer');
      }
      return true;
    case 'string':
      if (!('length' in type && typeof type.length === 'number')) {
        throw new Error('ABI function parameter has an incorrectly formed string');
      }
      return true;
    case 'array':
      if (!('length' in type && typeof type.length === 'number' && 'type' in type)) {
        throw new Error('ABI function parameter has an incorrectly formed array');
      }
      return abiParameterTypeChecker(type.type);
    case 'struct':
      if (!('fields' in type)) {
        throw new Error('ABI function parameter has an incorrectly formed struct');
      }
      return type.fields.reduce((acc, field) => {
        if (!('name' in field && typeof field.name === 'string')) {
          throw new Error('ABI function parameter has an incorrectly formed struct');
        }
        return acc && abiParameterTypeChecker(field.type);
      }, true);
    default:
      throw new Error('ABI function parameter has an unrecognised type');
  }
}
