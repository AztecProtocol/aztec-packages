import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import { ProvingJob } from '@aztec/stdlib/interfaces/server';

// Test with the exact JSON string from the database
const testJobStr =
  '{"id":"1:BASE_PARITY:0104fbc2341fb466","type":2,"epochNumber":1,"inputsUri":"gs://aztec-proving-benchmarks/proving-jobs/inputs/2/1:BASE_PARITY:0104fbc2341fb466"}';

console.log('Testing with safeParse to see error details');
console.log('Input JSON:', testJobStr);

const parsed = JSON.parse(testJobStr);
console.log('Basic JSON.parse result:', parsed);
console.log('parsed.type:', parsed.type, 'typeof:', typeof parsed.type);

const result = ProvingJob.safeParse(parsed);
console.log('safeParse success:', result.success);
if (result.success) {
  console.log('safeParse data:', result.data);
} else {
  console.log('safeParse error:', result.error);
  console.log('safeParse error issues:', result.error.issues);
}

// Test direct parse to see what happens
try {
  const directResult = ProvingJob.parse(parsed);
  console.log('Direct parse result:', directResult);
} catch (error) {
  console.log('Direct parse error:', error);
  console.log('Direct parse error message:', error.message);
}
