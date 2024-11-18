import { UltraPlonkBackend } from '@aztec/bb.js';

import fs from 'fs';

(async () => {
  const importedFromFileVk = fs.readFileSync('./circuit/target/vk').toString('hex');

  const circuitArtifact = await import(`./circuit/target/circuit.json`);
  const backend = new UltraPlonkBackend(circuitArtifact.bytecode);
  const generatedVkey = await backend.getVerificationKey();
  const generatedVkeyHex = Buffer.from(generatedVkey).toString('hex');

  console.log(importedFromFileVk);
  console.log(generatedVkeyHex);

  console.log(importedFromFileVk === generatedVkeyHex);
})();
