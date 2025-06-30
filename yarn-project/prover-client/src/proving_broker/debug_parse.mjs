import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import { ProvingJob } from '@aztec/stdlib/interfaces/server';

// Test with the exact JSON string from the database
const testJobStr =
  '{"id":"1:BASE_PARITY:0104fbc2341fb466","type":2,"epochNumber":1,"inputsUri":"gs://aztec-proving-benchmarks/proving-jobs/inputs/2/1:BASE_PARITY:0104fbc2341fb466"}';

console.log('Testing jsonParseWithSchema with actual modules');
console.log('Input JSON:', testJobStr);

try {
  const result = jsonParseWithSchema(testJobStr, ProvingJob);
  console.log('Result:', JSON.stringify(result));
  console.log('Result type:', result.type, typeof result.type);
} catch (error) {
  console.log('Error:', error.message);
  console.log('Stack:', error.stack);
}
