import { jsonParseWithSchema } from '@aztec/foundation/json-rpc';
import { ProvingJob } from '@aztec/stdlib/interfaces/server';

// Test with the exact JSON string from the database
const testJobStr =
  '{"id":"1:BASE_PARITY:0104fbc2341fb466","type":2,"epochNumber":1,"inputsUri":"gs://aztec-proving-benchmarks/proving-jobs/inputs/2/1:BASE_PARITY:0104fbc2341fb466"}';

console.log('Testing exact sequence that jsonParseWithSchema should do');
console.log('Input JSON:', testJobStr);

// Test what jsonParseWithSchema should be doing step by step
console.log('\n1. JSON.parse(json):');
const step1 = JSON.parse(testJobStr);
console.log('Result:', step1);

console.log('\n2. schema.parse(step1):');
const step2 = ProvingJob.parse(step1);
console.log('Result:', step2);

console.log('\n3. Actual jsonParseWithSchema call:');
const step3 = jsonParseWithSchema(testJobStr, ProvingJob);
console.log('Result:', step3);

console.log('\n4. Are step2 and step3 equal?');
console.log('Equal:', JSON.stringify(step2) === JSON.stringify(step3));

// Let's also check the types of ProvingJob
console.log('\n5. ProvingJob type check:');
console.log('ProvingJob === ProvingJob:', ProvingJob === ProvingJob);
console.log('typeof ProvingJob:', typeof ProvingJob);
