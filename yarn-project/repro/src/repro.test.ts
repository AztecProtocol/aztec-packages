import { UltraPlonkBackend } from '@aztec/bb.js';

import createDebug from 'debug';
import fs from 'fs';

createDebug.log = console.error.bind(console);
createDebug.enable('*');

describe('Repro test', () => {
  it('Should show two vks are equal', async () => {
    const importedFromFileVk = fs.readFileSync(`circuit/vk`).toString('hex');
    const circuitArtifact = await import(`../circuit/target/program.json`);

    const backend = new UltraPlonkBackend(circuitArtifact.default.bytecode);
    const generatedVkey = await backend.getVerificationKey();
    const generatedVkeyHex = Buffer.from(generatedVkey).toString('hex');

    expect(importedFromFileVk).toEqual(generatedVkeyHex);
  });
});
