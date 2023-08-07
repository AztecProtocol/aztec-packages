import { ABIParameter, ContractAbi, FunctionAbi, generateFunctionSelector } from '@aztec/foundation/abi';

import { log } from 'console';
import upperFirst from 'lodash.upperfirst';

/**
 * Structured data describing a Noir Contract function parameter.
 * We sometimes make use of this (instead of the Contract's JSON ABI) when generating Noir code, because the `type` field is a Noir type (as opposed to a typescript type or an abi type, which seem to be 'lossy', in terms of expressing the type).
 */
type StructuredParam = {
  /**
   * parameter name
   */
  name: string;
  /**
   * parameter type (this is a Noir type: not a typescript type or a type as formatted in the json abi, but a type that you write when writing actual Noir code).
   */
  type: string;
};

/**
 * Structured data describing a Noir Contract function.
 * We sometimes make use of this (instead of the Contract's JSON ABI) when generating Noir code, because the structured param field is easier to generate Noir code from, and it includes a selector.
 * TODO: returnTypes isn't used yet...
 */
type FuncData = {
  name: string;
  parameters: string[];
  structuredParameters: StructuredParam[];
  returnTypes: string[];
  selector: string | null;
};

/**
 * Remove comments from a Noir contract file.
 * @param sourceCode - the original Noir Contract file.
 * @returns - a version of the Noir Contract file, but with comments removed (for easier later parsing).
 */
function removeComments(sourceCode: string): string {
  // Hybrid comments pattern `//******/`
  const hybridCommentPattern = /\/\/\*+\/\n/g;
  sourceCode = sourceCode.replace(hybridCommentPattern, '');

  // Remove block comments (/* ... */)
  const blockCommentPattern = /\/\*[\s\S]*?\*\//g;
  sourceCode = sourceCode.replace(blockCommentPattern, '');

  // Remove line comments (// ...)
  const lineCommentPattern = /\/\/[^\n]*(?:\n|$)/g;
  sourceCode = sourceCode.replace(lineCommentPattern, '');

  return sourceCode;
}

/**
 * Convert strings of the form `param_name: NoirTypeName` to a StructuredParam.
 * @param paramStrings - `param_name: NoirTypeName`
 * @returns the same data, but in a StructuredParam format.
 */
function getStructuredParameters(paramStrings: string[]): StructuredParam[] {
  const structuredParams = paramStrings
    .map(item => item.split(':').map(part => part.trim()))
    .map(item => {
      return { name: item[0], type: item[1] };
    });
  return structuredParams;
}

/**
 * Parses the Noir Contact source code.
 * Removes comments.
 * Then searches for all PRIVATE functions, matching:
 * 1: private function name
 * 2: parameters.
 * Parameters are read directly as `param_name: NoirTypeName`, and then are converted into a StructuredParam.
 * NOTE: return types are not processed, because a PRIVATE Noir Contract function does not return its return_values. The thing that's returned is always a `PrivateCircuitPublicInputs` struct, which won't be transpiled over into our contract interface.
 * @param sourceCode - the original Noir Contract file.
 * @returns - FuncData for every PRIVATE function in the Noir contract.
 */
function extractPrivateFunctionData(sourceCode: string): FuncData[] {
  const functionPattern = /fn\s+(\w+)\s*\(\s*([^)]*)\s*\)\s*->\s*distinct\s+pub\s+abi::PrivateCircuitPublicInputs/g;
  const functionData: FuncData[] = [];
  let match: RegExpExecArray | null;

  while ((match = functionPattern.exec(sourceCode)) !== null) {
    const functionName = match[1];
    const paramsWithoutComments = removeComments(match[2]);
    const parameters = paramsWithoutComments
      .split(',')
      .map(param => param.trim())
      .filter(param => param !== '')
      .filter(param => !param.includes('PrivateContextInputs')); // Remove this type of param, as it isn't needed in the contract interface.
    functionData.push({
      name: functionName,
      parameters,
      structuredParameters: getStructuredParameters(parameters),
      returnTypes: [], // TODO
      selector: null,
    });
  }

  return functionData;
}

/**
 * Parse and extract information about each function in the source code. We do this (rather than relying on the json artifact/abi, because the abi is lossy, in that it doesn't preserve the names of the original Noir types, which are useful for generating more Noir code with those same types).
 * @param sourceCode - the original Noir Contract file.
 * @returns - FuncData for every function in the Noir contract.
 * TODO: It doesn't process public (`open`) functions yet!
 */
function extractFunctionData(sourceCode: string): FuncData[] {
  return extractPrivateFunctionData(sourceCode);
}

/**
 * Populate the `selector` field of FuncData, for every function in our contract.
 * @param functionData - An array of data describing the name, selector, params, and return types of every function. The
 * @param abi - The ContractAbi of the Noir Contract, as generated in the `copy_output.ts` file. Rather than use our custom FuncData (which is very useful for generating Noir code, because it preserves the original Noir type names), we use the typescript ContractAbi struct to generate the selector, because the pre-existing `generateFunctionSelector` function expects the `AbiParameter` type.
 * @returns functionData, but mutated to add a `selector` for every function.
 */
function addFunctionSelectors(functionData: FuncData[], abi: ContractAbi) {
  return functionData.map(f => {
    const fAbi = abi.functions.find(fAbi => fAbi.name === f.name);
    if (!fAbi) {
      log(
        `Couldn't find fn '${f.name}' (which was found by parsing contract '${abi.name}' in the json abi's functons.`,
      );
      return f;
    }
    // throw new Error(
    //   `Couldn't find fn '${f.name}' (which was found by parsing contract '${abi.name}' in the json abi's functons.`,
    // );
    if (f.selector) {
      throw new Error(
        `Didn't expect function ${f.name} to already have a selector to have been calculated and assigned!`,
      );
    }
    return Object.assign(f, {
      selector: `0x${generateFunctionSelector(fAbi.name, fAbi.parameters).toString('hex')}`,
    });
  });
}

/**
 * Parse and extract information about each function in the source code. We do this (rather than relying on the json artifact/abi, because the abi is lossy, in that it doesn't preserve the names of the original Noir types, which are useful for generating more Noir code with those same types).
 * @param sourceCode - the original Noir Contract file.
 * @param abi - The ContractAbi of the Noir Contract, as generated in the `copy_output.ts` file.
 * @returns - FuncData for every function in the Noir contract.
 * TODO: It doesn't process public (`open`) functions yet!
 */
function generateFunctionData(sourceCode: string, abi: ContractAbi) {
  let functionData = extractFunctionData(sourceCode);
  // Populate the function selector fields of the function data.
  functionData = addFunctionSelectors(functionData, abi);
  log('functionData', functionData);
  return functionData;
}

/**
 * Code generation.
 * Declare the `serialised_args` array.
 * @param structuredParams - the parameters for a particular Noir Contract function. We'll make use of the param types to generate `<PARAM_NAME>_SERIALISED_LEN` global fields. This code generator relies on such globals existing in the `noir-libs/.../types/` directory (which is temporary, until we have traits which can enforce the existence of serialisation methods).
 * @returns a code string.
 */
function declareSerialisedArgs(structuredParams: StructuredParam[]) {
  const serialisedLengthNames = structuredParams.map(p => `${p.type.toUpperCase()}_SERIALISED_LEN`);
  return `
    let mut serialised_args = [0; ${serialisedLengthNames.join(' + ')}];
`;
}

/**
 * Code generation.
 * Populate the `serialised_args` array with serialised versions of the contract's args. For each param of this function, this function will be called, generating a chunk of code which will populate some more of the `serialised_args` array.
 * @param structuredParam - a parameter of a particular Noir Contract function. We'll make use of the param's name and type to generate the name of (and call) the serialisation method. This code generator relies on such methods existing in the `noir-libs/.../types/` directory (which is temporary, until we have traits which can enforce the existence of serialisation methods).
 * @returns a code string.
 */
function generateSerialisationChunk(structuredParam: StructuredParam) {
  const { name, type } = structuredParam;
  return `
    let serialise${type} = ${type}SerialisationMethods.serialise;
    serialised_args = spread(
      serialised_args,
      serialise${type}(${name}),
      spread_index
    );
    spread_index += ${type.toUpperCase()}_SERIALISED_LEN;
  `;
}

/**
 * Code generation.
 * Call a function of the contract being described by this contract interface.
 * @param selector - the function selector of a function
 * @returns a code string.
 */
function generateCallStatement(selector: string) {
  return `
    context.call_private_function(self.address, ${selector}, serialised_args).public_inputs.return_values
  `;
}

/**
 * Code generation.
 * Generate a function interface for a particular function of the Noir Contract being processed. This function will be a method of the ContractInterface struct being created here.
 * @param functionData - data relating to the function, which can be used to generate a callable Noir Function.
 * @returns a code string.
 */
function generateFunctionInterface(functionData: FuncData) {
  const { name, parameters, structuredParameters, selector } = functionData;

  const serialisedArgsDeclaration = declareSerialisedArgs(structuredParameters!);
  const serialisationChunks = structuredParameters!.map(generateSerialisationChunk);
  const callStatement = generateCallStatement(selector!);

  return `
  fn ${name}(
    self,
    context: &mut Context,
    ${parameters.join(',\n\t\t')}
  ) -> [Field; RETURN_VALUES_LENGTH] {
    ${serialisedArgsDeclaration}

    let mut spread_index: Field = 0;

    ${serialisationChunks.join('\n')}

    ${callStatement}
  }
  `;
}

/**
 * Find all `use` statements in a noir file, and copy each statement (`use ... ;`) into an `imports` array of statement strings.
 * @param sourceCode - The original Noir Contract code.
 * @returns An array of strings, with each string of the form: `use ... ;`
 */
function parseImports(sourceCode: string): string[] {
  const importPattern = /use\s+([^;]+)/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(sourceCode)) !== null) {
    const importStatement = match[1].trim();
    imports.push(importStatement);
  }
  return imports;
}

/**
 * Extracts all imported names, and returns those names as an array.
 * This will be useful for itentifying any custom struct parameters which are used in functions of this contract. The struct names can then be matches with the corresponding import statement, so that the import statement can be copied across to the contract interface file.
 * @param importStatement - a string of the form `use ... ;`. This could be a one-line import, or it could be an import statement with lots of nested braces, which imports many names into the file's scope.
 * @returns - an array of imported names.
 */
function extractImportedNames(importStatement: string): string[] {
  // Remove alias names delineated by `name as alias`
  importStatement = importStatement.replace(/\s+as\s+\w+\s*,/g, ',');

  // rm whitespace
  importStatement = importStatement.replace(/\s/g, '');

  const names: string[] = [];
  if (!importStatement.includes(`::`)) {
    throw new Error(`Expected import statement to contain '::`);
  }

  if (importStatement.includes(`}`)) {
    // It's a braced import statement.
    // Extract words ending in `,` or `}`
    const importPattern = /(?:^|\W)(\w+)(?=,|\}|$)/g;
    let match: RegExpExecArray | null;
    while ((match = importPattern.exec(importStatement)) !== null) {
      // log('match', match);
      const name = match[1].trim();
      names.push(name);
    }
  } else {
    // It's a simple 1-line import without braces, so grab the last word:
    names.push(importStatement.split('::').at(-1)!);
  }

  return names;
}

/**
 * Code generation.
 * @returns - a string of code which will be needed in _every_ contract interface, regardless of the contract. (Hence the name 'static').
 */
function generateStaticImports() {
  return `
use dep::std;
use dep::aztec::context::Context;
use dep::aztec::constants_gen::RETURN_VALUES_LENGTH;

// ---

`;
}

/**
 * Allows serialisation methods to be imported from other files. This expects any type which gets used as a function parameter to have a `serialise` function, a `deserialise` function and a `<TYPENAME>_SERIALISED_LEN` global. See `noir-libs/.../types/` for more details. This is a temporary solution, until Noir supports traits.
 * @param type - The name of a Noir type / struct.
 * @returns - A portion of an import path and names.
 */
function generateTypeSerialisationImport(type: string) {
  return `
  ${type.toLowerCase()}_serialisation::{
    ${upperFirst(type)}SerialisationMethods,
    ${type.toUpperCase()}_SERIALISED_LEN,
  },
`;
}

// TODO: Identify custom types, and then generate imports for custom types' serialisation methods.
/**
 * Code generation.
 * Generates import statements for serialisation methods and globals. Only for Native Types so far. See the TODO for supporting the importing of custom structs.
 * @param functionData - Data relating to every function in the Noir Contract.
 * @returns - Code. An import statement for every native type.
 */
function generateNativeTypeSerialisationImports(functionData: FuncData[]) {
  const types = functionData.flatMap(fnData => fnData.structuredParameters.map(p => p.type));
  const removeDuplicates = (arr: string[]) => [...new Set(arr)]; // we only want the import statement for a particular type to appear once, or compilation will fail!
  const importStatements = removeDuplicates(types).map(generateTypeSerialisationImport);
  return `
use dep::aztec::types::type_serialisation::{
  ${importStatements.join('\n')}
};
`;
}

// TODO: this should probably go in noir-libs, instead.
/**
 * Generate a `spread` function, which is needed for populating `serialised_args` from arrays of fields.
 * @returns Code.
 */
function generateSpreadHelperFunction() {
  return `
// Spread an array into an array:
fn spread<SRC_LEN, TARGET_LEN>(mut target_arr: [Field; TARGET_LEN], src_arr: [Field; SRC_LEN], at_index: Field) -> [Field; TARGET_LEN] {
  let mut j = at_index;
  for i in 0..SRC_LEN {
      target_arr[j] = src_arr[i]; 
  }
  target_arr
}
`;
}

/**
 * Generate the main focus of this code generator: the contract interface struct.
 * @param contractName - the name of the contract, as matches the original source file.
 * @returns Code.
 */
function generateContractInterfaceStruct(contractName: string) {
  return `
struct ${contractName}_ContractInterface {
  address: Field,
}
`;
}

/**
 *
 * @param contractName - the name of the contract, as matches the original source file.
 * @param functions - An array of strings, where each string is valid Noir code describing the function interface of one of the contract's functions (as generated via `generateFunctionInterface` above).
 * @returns
 */
function generateContractInterfaceImpl(contractName: string, functions: string[]) {
  return `
impl ${contractName}_ContractInterface {
  fn at(address: Field) -> Self {
      Self {
          address,
      }
  }
  ${functions.join('\n')}
}
`;
}

// YOU CAN QUICKLY TEST WITH:
//
// `NODE_OPTIONS=--no-warnings yarn ts-node --esm src/scripts/copy_output.ts zk_token`
//
// from the noir-contract/ dir of the monorepo.
// DANGER: this will write files, so make sure you run it from the correct place!

/**
 * Generates the typescript code to represent a contract.
 * @param input - The compiled Noir artifact.
 * @param abiImportPath - Optional path to import the ABI (if not set, will be required in the constructor).
 * @returns The corresponding ts code.
 */
export function generateNoirContractInterface(sourceCode: string, abi: ContractAbi) {
  const functionData: FuncData[] = generateFunctionData(sourceCode, abi);

  // Note: we'll use import statements for importing serialisation methods for custom parameter types.
  const importStatements: string[] = parseImports(sourceCode);
  const importedNames: string[] = importStatements.flatMap(extractImportedNames);

  const contractInterfaceStruct: string = generateContractInterfaceStruct(abi.name);
  const contractInterfaceFunctions: string[] = functionData.map(f => generateFunctionInterface(f));
  const contractInterfaceImpl: string = generateContractInterfaceImpl(abi.name, contractInterfaceFunctions);

  return `
/* Autogenerated file, do not edit! */

${generateStaticImports()}
${generateNativeTypeSerialisationImports(functionData)}
${generateSpreadHelperFunction()}
${contractInterfaceStruct}
${contractInterfaceImpl}
`;
}
