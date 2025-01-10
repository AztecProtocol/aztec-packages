import { UltraHonkBackend } from '@aztec/bb.js';

import { Noir } from '@noir-lang/noir_js';

import main from '../main/target/main.json';
import recursion from '../recursion/target/recursion.json';

document.getElementById('bbProveMulti').addEventListener('click', async () => {
  // Currently if you pass a non-power of 2 number of threads, you only get as many as the nearest smaller power of two
  // We expect this to be easy to fix.
  prove(1 << Math.log2(navigator.hardwareConcurrency));
});

document.getElementById('bbProveSingle').addEventListener('click', async () => {
  prove(1);
});

const prove = async threads => {
  console.log(`Running with ${threads} threads`);
  try {
    var backend = new UltraHonkBackend(main.bytecode, { threads }, { recursive: true });
    var noir = new Noir(main);
    const baseInput = {
      x: 1,
      y: 2,
    };

    // generate the base proof
    console.log('Generating base witness... ⌛');
    var startTime = performance.now();
    var { witness } = await noir.execute(baseInput); // WORKTODO: this has to change
    var endTime = performance.now();
    console.log(`Witness generation took ${endTime - startTime} ms`);

    console.log('Generating base proof... ⌛');
    startTime = performance.now();
    const baseProof = await backend.generateProof(witness);
    endTime = performance.now();
    console.log('Generating base proof... ✅');
    console.log(`Base proof generation took ${endTime - startTime} ms`);

    console.log('Verifying base proof... ⌛');
    var isValid = await backend.verifyProof(baseProof);
    if (isValid) console.log('Verifying base proof... ✅');

    const proofArtifacts = await backend.generateRecursiveProofArtifacts(baseProof.proof, baseProof.publicInputs);

    // generate the recursion proof
    backend = new UltraHonkBackend(recursion.bytecode, { threads: threads }, { recursive: false });
    noir = new Noir(recursion);
    const { publicInputs } = baseProof;
    const { vkAsFields, proofAsFields, vkHash } = proofArtifacts;
    const recursionInput = {
      verification_key: vkAsFields,
      proof: proofAsFields,
      public_inputs: [publicInputs[0]],
      key_hash: vkHash,
    };

    console.log('Generating recursion witness... ⌛');
    startTime = performance.now();
    var { witness } = await noir.execute(recursionInput);
    endTime = performance.now();
    console.log(`Witness generation took ${endTime - startTime} ms`);

    console.log('Generating recursion proof... ⌛');
    startTime = performance.now();
    const recursionProof = await backend.generateProof(witness);
    endTime = performance.now();
    console.log(`Recursive proof generation took ${endTime - startTime} ms`);

    console.log('Verifying recursion proof... ⌛');
    isValid = await backend.verifyProof(recursionProof);
    if (isValid) console.log('Verifying recursion proof... ✅');
  } catch (err) {
    console.error(`Proof generation failed: ${err}`);
  }
};
