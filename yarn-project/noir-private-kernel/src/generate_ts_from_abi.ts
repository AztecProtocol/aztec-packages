import fs from 'fs/promises';

type AbiParameter = {
    name: string;
    type: AbiType;
    visibility: 'public' | 'private';
};

type AbiType =
    | { kind: 'integer'; sign: 'signed' | 'unsigned'; width: number }
    | { kind: 'array'; length: number; type: AbiType }
    | { kind: 'struct'; path: string; fields: AbiParameter[] }
    | { kind: 'tuple'; fields: AbiType[] }
    | { kind: 'field' }
    | { kind: 'boolean' };

type Abi = {
    parameters: AbiParameter[];
    param_witnesses: Record<string, number[]>;
    return_type: AbiType;
    return_witnesses: any[];
};

type ABIJson = {
    hash: number;
    backend: string;
    abi: Abi;
    bytecode: string;
};

// Keep track off all of the Noir primitive types that were used.
// Most of these will not have a 1-1 definition in TypeScript,
// so we will need to generate type aliases for them.
//  
// We want to generate type aliases 
// for specific types that are used in the ABI.
//
// For example:
// - If `Field` is used we want to alias that 
// with `number`.
// - If `u32` is used we want to alias that with `number` too.
type PrimitiveTypesUsed = {
    alias_name: string;
    ts_type: string;
};

// Typescript does not allow us to check for equality of non-primitive types
// easily, so we create a addIfUnique function that will only add an item
// to the map if it is not already there by using JSON.stringify.
const noirPrimitiveTypesToTsTypes = new Map<string, PrimitiveTypesUsed>();
function addIfUnique(item: PrimitiveTypesUsed) {
    const key = JSON.stringify(item);
    if (!noirPrimitiveTypesToTsTypes.has(key)) {
        noirPrimitiveTypesToTsTypes.set(key, item);
    }
}

function abiTypeToTs(type: AbiType): string {
    switch (type.kind) {
        case 'integer':
            let tsIntType = '';
            if (type.sign === 'signed') {
                tsIntType = `i${type.width}`;
            } else {
                tsIntType = `u${type.width}`;
            }
            addIfUnique({alias_name: tsIntType, ts_type: 'number'});
            return tsIntType;
        case 'boolean':
            return `boolean`;
        case 'array':
            return `${abiTypeToTs(type.type)}[]`;
        case 'struct':
            return getLastComponentOfPath(type.path);
        case 'tuple':
            return `[${type.fields.map((type) => abiTypeToTs(type)).join(', ')}]`;
        case 'field':
            addIfUnique({alias_name: 'Field', ts_type: 'number'});
            return 'Field';
    }
}

// Returns the last component of a path, e.g. "foo::bar::baz" -> "baz"
// Note: that if we have a path such as "Baz", we will return "Baz".
//
// Since these paths corresponds to structs, we can assume that we
// cannot have "foo::bar::".
//
// We also make the assumption that since these paths are coming from 
// Noir, then we will not have two paths that look like this:
// - foo::bar::Baz
// - cat::dog::Baz
// ie the last component of the path (struct name) is enough to uniquely identify
// the whole path.
//
// TODO: We should double check this assumption when we use type aliases,
// I expect that `foo::bar::Baz as Dog` would effectively give `foo::bar::Dog`  
function getLastComponentOfPath(str: string): string {
    const parts = str.split('::');
    const lastPart = parts[parts.length - 1];
    return lastPart;
}

function generateStructInterfaces(type: AbiType, output: Set<string>): string {
    let result = '';

    // Edge case to handle the array of structs case.
    // @ts-ignore
    if (type.kind === 'array' && type.type.kind === 'struct' && !output.has(getLastComponentOfPath(type.type.path))) {
        // @ts-ignore
        result += generateStructInterfaces(type.type, output);
    }
    if (type.kind !== 'struct') return result;
    
    // List of structs encountered while viewing this type that we need to generate
    // bindings for.
    let typesEncountered = new Set<AbiType>();
    
    // Codegen the struct and then its fields, so that the structs fields
    // are defined before the struct itself.
    let codeGeneratedStruct = '';
    let codeGeneratedStructFields = '';
    
    const structName = getLastComponentOfPath(type.path);
    if (!output.has(structName)) {
        codeGeneratedStruct += `interface ${structName} {\n`;
        for (const field of type.fields) {
            codeGeneratedStruct += `  ${field.name}: ${abiTypeToTs(field.type)};\n`;
            typesEncountered.add(field.type);
        }
        codeGeneratedStruct += `}\n\n`;
        output.add(structName);

        // Generate code for the encountered structs in the field above
        for (const type of typesEncountered) {
            codeGeneratedStructFields += generateStructInterfaces(type, output);
        }
    }

    return codeGeneratedStructFields + "\n" +codeGeneratedStruct;
}

function generateTsInterface(abiObj: any): string {
    let result = ``;
    const outputStructs = new Set<string>();

    // Define structs for composite types
    for (const param of abiObj.parameters) {
        result += generateStructInterfaces(param.type, outputStructs);
    }
    
    // Generating Return type, if it exists
    //
    if (abiObj.return_type != null) {
        result += generateStructInterfaces(abiObj.return_type, outputStructs);
        result += `export interface ReturnType {\n`;
        result += `  value: ${abiTypeToTs(abiObj.return_type)};\n`;
        result += `}\n\n`;
    }

    // Generating Input type
    result += 'export interface InputType {\n';
    for (const param of abiObj.parameters) {
        result += `  ${param.name}: ${abiTypeToTs(param.type)};\n`;
    }
    result += '}';

    // Generating the execute function
    result += `\n\nexport function execute(input: InputType)`;
    if (abiObj.return_type != null) {
        result += `: ReturnType`;
    }
    result += ` {\n`;
    result += `   throw Error('Add execute function logic here')\n`;
    result += `}`;
    
    // Add the primitive Noir types that do not have a 1-1 mapping to TypeScript.
    let primitiveTypeAliases = '';
    for (const [key, value] of noirPrimitiveTypesToTsTypes) {
        primitiveTypeAliases += `\ntype ${value.alias_name} = ${value.ts_type};`;
    }

    return primitiveTypeAliases + "\n"+ result;
}

// Example usage for init function
export async function example() {
    const rawData = await fs.readFile('./src/target/private_kernel_init.json', 'utf-8');
    const abiObj: ABIJson = JSON.parse(rawData);
    const generatedInterface = generateTsInterface(abiObj.abi);
    await fs.writeFile('./src/generated_bindings.ts', generatedInterface);
}