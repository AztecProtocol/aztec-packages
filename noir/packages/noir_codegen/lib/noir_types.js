/**
 * Typescript does not allow us to check for equality of non-primitive types
 * easily, so we create a addIfUnique function that will only add an item
 * to the map if it is not already there by using JSON.stringify.
 * @param item - The item to add to the map.
 */
function addIfUnique(primitiveTypeMap, item) {
    const key = JSON.stringify(item);
    if (!primitiveTypeMap.has(key)) {
        primitiveTypeMap.set(key, item);
    }
}
/**
 * Converts an ABI type to a TypeScript type.
 * @param type - The ABI type to convert.
 * @returns The typescript code to define the type.
 */
function abiTypeToTs(type, primitiveTypeMap) {
    switch (type.kind) {
        case 'field':
            addIfUnique(primitiveTypeMap, { aliasName: 'Field', tsType: 'string' });
            return 'Field';
        case 'integer': {
            const typeName = type.sign === 'signed' ? `i${type.width}` : `u${type.width}`;
            // Javascript cannot safely represent the full range of Noir's integer types as numbers.
            // `Number.MAX_SAFE_INTEGER == 2**53 - 1` so we disallow passing numbers to types which may exceed this.
            // 52 has been chosen as the cutoff rather than 53 for safety.
            const tsType = type.width <= 52 ? `string | number` : `string`;
            addIfUnique(primitiveTypeMap, { aliasName: typeName, tsType });
            return typeName;
        }
        case 'boolean':
            return `boolean`;
        case 'array':
            // We can't force the usage of fixed length arrays as this currently throws errors in TS.
            // The array would need to be `as const` to support this whereas that's unlikely to happen in user code.
            // return `FixedLengthArray<${abiTypeToTs(type.type, primitiveTypeMap)}, ${type.length}>`;
            return `${abiTypeToTs(type.type, primitiveTypeMap)}[]`;
        case 'string':
            // We could enforce that literals are the correct length but not generally.
            // This would run into similar problems to above.
            return `string`;
        case 'struct':
            return getLastComponentOfPath(type.path);
        default:
            throw new Error(`Unknown ABI type ${JSON.stringify(type)}`);
    }
}
/**
 * Returns the last component of a path, e.g. "foo::bar::baz" -\> "baz"
 * Note: that if we have a path such as "Baz", we will return "Baz".
 *
 * Since these paths corresponds to structs, we can assume that we
 * cannot have "foo::bar::".
 *
 * We also make the assumption that since these paths are coming from
 * Noir, then we will not have two paths that look like this:
 * - foo::bar::Baz
 * - cat::dog::Baz
 * ie the last component of the path (struct name) is enough to uniquely identify
 * the whole path.
 *
 * TODO: We should double check this assumption when we use type aliases,
 * I expect that `foo::bar::Baz as Dog` would effectively give `foo::bar::Dog`
 * @param str - The path to get the last component of.
 * @returns The last component of the path.
 */
function getLastComponentOfPath(str) {
    const parts = str.split('::');
    const lastPart = parts[parts.length - 1];
    return lastPart;
}
/**
 * Generates TypeScript interfaces for the structs used in the ABI.
 * @param type - The ABI type to generate the interface for.
 * @param output - The set of structs that we have already generated bindings for.
 * @returns The TypeScript code to define the struct.
 */
function generateStructInterfaces(type, output, primitiveTypeMap) {
    let result = '';
    // Edge case to handle the array of structs case.
    if (type.kind === 'array' && type.type.kind === 'struct' && !output.has(getLastComponentOfPath(type.type.path))) {
        result += generateStructInterfaces(type.type, output, primitiveTypeMap);
    }
    if (type.kind !== 'struct')
        return result;
    // List of structs encountered while viewing this type that we need to generate
    // bindings for.
    const typesEncountered = new Set();
    // Codegen the struct and then its fields, so that the structs fields
    // are defined before the struct itself.
    let codeGeneratedStruct = '';
    let codeGeneratedStructFields = '';
    const structName = getLastComponentOfPath(type.path);
    if (!output.has(structName)) {
        codeGeneratedStruct += `export type ${structName} = {\n`;
        for (const field of type.fields) {
            codeGeneratedStruct += `  ${field.name}: ${abiTypeToTs(field.type, primitiveTypeMap)};\n`;
            typesEncountered.add(field.type);
        }
        codeGeneratedStruct += `};`;
        output.add(structName);
        // Generate code for the encountered structs in the field above
        for (const type of typesEncountered) {
            codeGeneratedStructFields += generateStructInterfaces(type, output, primitiveTypeMap);
        }
    }
    return codeGeneratedStructFields + '\n' + codeGeneratedStruct;
}
/**
 * Generates a TypeScript interface for the ABI.
 * @param abiObj - The ABI to generate the interface for.
 * @returns The TypeScript code to define the interface.
 */
export function generateTsInterface(abiObj, primitiveTypeMap) {
    let result = ``;
    const outputStructs = new Set();
    // Define structs for composite types
    for (const param of abiObj.parameters) {
        result += generateStructInterfaces(param.type, outputStructs, primitiveTypeMap);
    }
    // Generating Return type, if it exists
    if (abiObj.return_type != null) {
        result += generateStructInterfaces(abiObj.return_type, outputStructs, primitiveTypeMap);
    }
    return [result, getTsFunctionSignature(abiObj, primitiveTypeMap)];
}
function getTsFunctionSignature(abi, primitiveTypeMap) {
    const inputs = abi.parameters.map((param) => [
        param.name,
        abiTypeToTs(param.type, primitiveTypeMap),
    ]);
    const returnValue = abi.return_type ? abiTypeToTs(abi.return_type, primitiveTypeMap) : null;
    return { inputs, returnValue };
}
