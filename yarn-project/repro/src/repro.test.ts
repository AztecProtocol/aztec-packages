import { UltraPlonkBackend } from '@aztec/bb.js';

import fs from 'fs';

describe('Repro test', () => {
  it('Should show two vks are equal', async () => {
    const importedFromFileVk = fs.readFileSync(`circuit/vk`).toString('hex');
    const circuitArtifact = await import(`../circuit/target/program.json`);

    const backend = new UltraPlonkBackend(circuitArtifact.default.bytecode);
    const generatedVkey = await backend.getVerificationKey();
    const generatedVkeyHex = Buffer.from(generatedVkey).toString('hex');

    console.log(importedFromFileVk);
    console.log(generatedVkeyHex);

    expect(importedFromFileVk).toEqual(generatedVkeyHex);
  });
});
