import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';

console.log('jsonParseWithSchema function:');
console.log(jsonParseWithSchema);
console.log('toString():', jsonParseWithSchema.toString());
console.log('constructor.name:', jsonParseWithSchema.constructor.name);
console.log('Is async function?', jsonParseWithSchema[Symbol.toStringTag] === 'AsyncFunction');

// Test with a simple object
const simpleTest = '{"test": "value"}';
console.log('\nTesting with simple JSON:');
const result = jsonParseWithSchema(simpleTest, { parse: obj => obj });
console.log('Result:', result);
console.log('Result type:', typeof result);
console.log('Is promise?', result instanceof Promise);
