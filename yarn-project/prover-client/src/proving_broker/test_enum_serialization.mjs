import { z } from 'zod';

// Simulate the ProvingRequestType enum
const ProvingRequestType = {
  PUBLIC_VM: 0,
  PRIVATE_BASE_ROLLUP: 1,
  PUBLIC_BASE_ROLLUP: 2,
  MERGE_ROLLUP: 3,
  EMPTY_BLOCK_ROOT_ROLLUP: 4,
  BLOCK_ROOT_ROLLUP: 5,
  SINGLE_TX_BLOCK_ROOT_ROLLUP: 6,
  BLOCK_MERGE_ROLLUP: 7,
  ROOT_ROLLUP: 8,
  BASE_PARITY: 9,
  ROOT_PARITY: 10,
  TUBE_PROOF: 11,
};

// Create the schema like in the code
const ProvingJob = z.object({
  id: z.string(),
  type: z.nativeEnum(ProvingRequestType),
  epochNumber: z.number(),
  inputsUri: z.string(),
});

// Test the exact JSON string from the database
const realJsonStr =
  '{"id":"1:BASE_PARITY:07060a7db744d17c","type":2,"inputsUri":"gs://aztec-proving-benchmarks/proving-jobs/inputs/2/1:BASE_PARITY:07060a7db744d17c","epochNumber":1}';

console.log('Real JSON string from database:', realJsonStr);

// Parse back to object
const parsedObj = JSON.parse(realJsonStr);
console.log('Parsed object:', parsedObj);
console.log('Type value:', parsedObj.type, 'typeof:', typeof parsedObj.type);

// Try to validate with schema
try {
  const result = ProvingJob.parse(parsedObj);
  console.log('Schema validation successful:', result);
} catch (error) {
  console.log('Schema validation failed:', error.message);
  console.log('Error details:', error);
}
