import fs from 'fs/promises';
import { executeCircuit, WitnessMap } from '@noir-lang/acvm_js';

async function fetchJson() {
    const rawData = await fs.readFile('./src/target/private_kernel_init.json', 'utf-8');
    return JSON.parse(rawData);
}

const circuit = await fetchJson();
console.log('Initialized Noir instance with private kernel init circuit');

const decodedBytecode = Buffer.from(circuit.bytecode, 'base64');
const numWitnesses = 1811; // The number of input witnesses in the private kernel init circuit 
const initialWitness : WitnessMap = new Map();
for (let i = 1; i <= numWitnesses; i++) {
    initialWitness.set(i, "0x00");
}

const _witnessMap = await executeCircuit(decodedBytecode, initialWitness,() => {
      throw Error('unexpected oracle during execution');
});

console.log("Executed private kernel init circuit with all zeroes");


