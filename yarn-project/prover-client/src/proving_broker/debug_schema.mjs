import { ProvingJob } from '@aztec/stdlib/interfaces/server';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

console.log('Inspecting ProvingJob schema...');
console.log('ProvingJob:', ProvingJob);
console.log('ProvingJob._def:', ProvingJob._def);
console.log('ProvingJob._def.shape():', ProvingJob._def.shape());

// Try to understand the schema structure
const shape = ProvingJob._def.shape();
console.log('\nSchema shape:');
Object.keys(shape).forEach(key => {
  console.log(`  ${key}:`, shape[key]);
  if (shape[key]._def) {
    console.log(`    _def:`, shape[key]._def);
  }
});

console.log('\nProvingRequestType enum:');
console.log('ProvingRequestType:', ProvingRequestType);
console.log('Object.values(ProvingRequestType):', Object.values(ProvingRequestType));
