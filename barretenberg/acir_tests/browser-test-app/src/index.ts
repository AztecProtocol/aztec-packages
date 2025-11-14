import type { ProofData } from '@aztec/bb.js';
import { unpack } from 'msgpackr';
import { ungzip } from 'pako';

const logger = { debug: console.log, error: console.log };

function installUltraHonkGlobals() {
  async function prove(
    bytecode: string,
    witness: Uint8Array,
    threads?: number,
  ): Promise<{ proofData: ProofData; verificationKey: Uint8Array }> {
    const { UltraHonkBackend } = await import('@aztec/bb.js');

    logger.debug('starting test...');
    const backend = new UltraHonkBackend(bytecode, {
      threads,
      logger: console.log,
    });
    const proofData = await backend.generateProof(witness);

    logger.debug(`getting the verification key...`);
    const verificationKey = await backend.getVerificationKey();
    logger.debug(`destroying the backend...`);
    await backend.destroy();
    return { proofData, verificationKey };
  }

  async function verify(proofData: ProofData, verificationKey: Uint8Array) {
    const { UltraHonkVerifierBackend } = await import('@aztec/bb.js');

    logger.debug(`verifying...`);
    const backend = new UltraHonkVerifierBackend();
    const verified = await backend.verifyProof({
      ...proofData,
      verificationKey,
    });
    logger.debug(`verified: ${verified}`);

    await backend.destroy();

    logger.debug('test complete.');
    return verified;
  }

  (window as any).prove = prove;
  (window as any).verify = verify;
}
installUltraHonkGlobals();

function installChonkGlobal() {
  interface PrivateExecutionStepRaw {
    functionName: string;
    bytecode: Uint8Array;
    witness: Uint8Array;
    vk: Uint8Array;
  }

  async function processChonkInputs(ivcInputsBuf: Uint8Array): Promise<[Uint8Array[], Uint8Array[], Uint8Array[]]> {
    const acirBufs: Uint8Array[] = [];
    const vkBufs: Uint8Array[] = [];
    const witnessBufs: Uint8Array[] = [];
    // Unpack the msgpack data into the format AztecClientBackend expects
    const steps: PrivateExecutionStepRaw[] = unpack(ivcInputsBuf);
    for (const step of steps) {
      acirBufs.push(ungzip(step.bytecode));
      vkBufs.push(step.vk);
      witnessBufs.push(ungzip(step.witness));
    }
    return [acirBufs, witnessBufs, vkBufs];
  }

  async function proveChonk(
    ivcInputsBuf: Uint8Array,
    threads?: number,
  ): Promise<{ proof: Uint8Array; verificationKey: Uint8Array }> {
    const { AztecClientBackend } = await import('@aztec/bb.js');

    const [acirBufs, witnessBufs, vkBufs] = await processChonkInputs(ivcInputsBuf);
    logger.debug('starting test...');
    const backend = new AztecClientBackend(acirBufs, {
      threads,
      logger: console.log,
    });
    const [_, proof, verificationKey] = await backend.prove(witnessBufs, vkBufs);
    await backend.destroy();
    return { proof, verificationKey };
  }

  (window as any).proveChonk = proveChonk;
}

installChonkGlobal();

document.addEventListener('DOMContentLoaded', function () {
  // Create status div for messages
  const statusDiv = document.createElement('div');
  statusDiv.style.margin = '20px';
  statusDiv.style.padding = '10px';
  statusDiv.style.border = '1px solid #ccc';
  statusDiv.style.backgroundColor = '#f9f9f9';
  statusDiv.innerText = 'Ready. Select files and click Run UltraHonk Proving.\n';

  // Create visible file inputs for UltraHonk
  const ultraHonkContainer = document.createElement('div');
  ultraHonkContainer.style.margin = '20px';
  ultraHonkContainer.style.padding = '10px';
  ultraHonkContainer.style.border = '2px solid #4CAF50';
  ultraHonkContainer.style.borderRadius = '5px';

  const ultraHonkTitle = document.createElement('h3');
  ultraHonkTitle.innerText = 'UltraHonk Proving\n';
  ultraHonkContainer.appendChild(ultraHonkTitle);

  const acirLabel = document.createElement('label');
  acirLabel.innerText = 'ACIR Bytecode: ';
  acirLabel.style.display = 'block';
  acirLabel.style.marginBottom = '10px';
  const acirInput = document.createElement('input');
  acirInput.type = 'file';
  acirInput.accept = '.json,.acir';
  acirLabel.appendChild(acirInput);
  ultraHonkContainer.appendChild(acirLabel);

  const witnessLabel = document.createElement('label');
  witnessLabel.innerText = 'ACIR Witness: ';
  witnessLabel.style.display = 'block';
  witnessLabel.style.marginBottom = '10px';
  const witnessInput = document.createElement('input');
  witnessInput.type = 'file';
  witnessInput.accept = '.gz,.witness';
  witnessLabel.appendChild(witnessInput);
  ultraHonkContainer.appendChild(witnessLabel);

  // Add loop checkbox
  const loopLabel = document.createElement('label');
  loopLabel.style.display = 'block';
  loopLabel.style.marginTop = '10px';
  loopLabel.style.marginBottom = '10px';
  const loopCheckbox = document.createElement('input');
  loopCheckbox.type = 'checkbox';
  loopCheckbox.id = 'ultraHonkLoop';
  loopCheckbox.style.marginRight = '5px';
  loopLabel.appendChild(loopCheckbox);
  const loopText = document.createTextNode('Run continuously until error');
  loopLabel.appendChild(loopText);
  ultraHonkContainer.appendChild(loopLabel);

  let ultraHonkRunning = false;
  let ultraHonkShouldStop = false;

  const ultraHonkButton = document.createElement('button');
  ultraHonkButton.innerText = 'Run UltraHonk Proving';
  ultraHonkButton.style.marginTop = '10px';
  ultraHonkButton.addEventListener('click', async () => {
    // If already running, stop it
    if (ultraHonkRunning) {
      ultraHonkShouldStop = true;
      ultraHonkButton.innerText = 'Run UltraHonk Proving';
      return;
    }

    try {
      statusDiv.style.backgroundColor = '#f9f9f9';

      if (!acirInput.files || !acirInput.files[0]) {
        statusDiv.innerText += 'Please select an ACIR bytecode file.\n';
        statusDiv.style.backgroundColor = '#ffffcc';
        return;
      }
      if (!witnessInput.files || !witnessInput.files[0]) {
        statusDiv.innerText += 'Please select an ACIR witness file.\n';
        statusDiv.style.backgroundColor = '#ffffcc';
        return;
      }

      statusDiv.innerText = 'Loading files...\n';
      const acir = JSON.parse(await acirInput.files[0].text()).bytecode;

      const witnessFile = witnessInput.files[0];
      const witnessArrayBuffer = await witnessFile.arrayBuffer();
      const witness = new Uint8Array(witnessArrayBuffer);

      const isLooping = loopCheckbox.checked;
      ultraHonkRunning = true;
      ultraHonkShouldStop = false;

      if (isLooping) {
        ultraHonkButton.innerText = 'Stop Loop';
      }

      // Create backends once before the loop
      const { UltraHonkBackend, UltraHonkVerifierBackend } = await import('@aztec/bb.js');
      const proverBackend = new UltraHonkBackend(acir, {
        logger: console.log,
      });
      const verifierBackend = new UltraHonkVerifierBackend();

      let iteration = 0;
      try {
        do {
          iteration++;
          statusDiv.innerText = `Iteration ${iteration}: Running proof generation...\n`;
          const proofData = await proverBackend.generateProof(witness);
          const verificationKey = await proverBackend.getVerificationKey();

          statusDiv.innerText += `Iteration ${iteration}: Verifying proof...\n`;
          await verifierBackend.verifyProof({ ...proofData, verificationKey });
          statusDiv.innerText += `✓ Iteration ${iteration} complete!\n`;
          statusDiv.style.backgroundColor = '#ccffcc';

          // Small delay to allow UI updates
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (isLooping && !ultraHonkShouldStop);
      } finally {
        // Clean up backends
        await proverBackend.destroy();
        await verifierBackend.destroy();
      }

      ultraHonkRunning = false;
      ultraHonkButton.innerText = 'Run UltraHonk Proving';

      if (ultraHonkShouldStop) {
        statusDiv.innerText += `\n⏸ Stopped after ${iteration} iterations.\n`;
      } else {
        statusDiv.innerText += '\n✓ Complete! Proof generated and verified.\n';
      }
      statusDiv.style.backgroundColor = '#ccffcc';
    } catch (error) {
      ultraHonkRunning = false;
      ultraHonkButton.innerText = 'Run UltraHonk Proving';
      logger.error('Error during UltraHonk proving:', error);
      statusDiv.innerText += '✗ Error during UltraHonk proving. Check console for details.\n';
      statusDiv.style.backgroundColor = '#ffcccc';
    }
  });
  ultraHonkContainer.appendChild(ultraHonkButton);
  document.body.appendChild(ultraHonkContainer);

  // Create visible file input for Chonk
  const chonkContainer = document.createElement('div');
  chonkContainer.style.margin = '20px';
  chonkContainer.style.padding = '10px';
  chonkContainer.style.border = '2px solid #2196F3';
  chonkContainer.style.borderRadius = '5px';

  const chonkTitle = document.createElement('h3');
  chonkTitle.innerText = 'Chonk Proving';
  chonkContainer.appendChild(chonkTitle);

  const ivcLabel = document.createElement('label');
  ivcLabel.innerText = 'IVC Inputs (.msgpack): ';
  ivcLabel.style.display = 'block';
  ivcLabel.style.marginBottom = '10px';
  const ivcInput = document.createElement('input');
  ivcInput.type = 'file';
  ivcInput.accept = '.msgpack';
  ivcLabel.appendChild(ivcInput);
  chonkContainer.appendChild(ivcLabel);

  // Add loop checkbox for Chonk
  const chonkLoopLabel = document.createElement('label');
  chonkLoopLabel.style.display = 'block';
  chonkLoopLabel.style.marginTop = '10px';
  chonkLoopLabel.style.marginBottom = '10px';
  const chonkLoopCheckbox = document.createElement('input');
  chonkLoopCheckbox.type = 'checkbox';
  chonkLoopCheckbox.id = 'chonkLoop';
  chonkLoopCheckbox.style.marginRight = '5px';
  chonkLoopLabel.appendChild(chonkLoopCheckbox);
  const chonkLoopText = document.createTextNode('Run continuously until error');
  chonkLoopLabel.appendChild(chonkLoopText);
  chonkContainer.appendChild(chonkLoopLabel);

  let chonkRunning = false;
  let chonkShouldStop = false;

  const chonkButton = document.createElement('button');
  chonkButton.innerText = 'Run Chonk Proving';
  chonkButton.style.marginTop = '10px';
  chonkButton.addEventListener('click', async () => {
    // If already running, stop it
    if (chonkRunning) {
      chonkShouldStop = true;
      chonkButton.innerText = 'Run Chonk Proving';
      return;
    }

    try {
      statusDiv.style.backgroundColor = '#f9f9f9';

      if (!ivcInput.files || !ivcInput.files[0]) {
        statusDiv.innerText = 'Please select an IVC inputs file (.msgpack).';
        statusDiv.style.backgroundColor = '#ffffcc';
        return;
      }

      const ivcInputsBuf = new Uint8Array(await ivcInput.files[0].arrayBuffer());

      const isLooping = chonkLoopCheckbox.checked;
      chonkRunning = true;
      chonkShouldStop = false;

      if (isLooping) {
        chonkButton.innerText = 'Stop Loop';
      }

      // Process inputs and create backend once before the loop
      const { AztecClientBackend } = await import('@aztec/bb.js');
      const acirBufs: Uint8Array[] = [];
      const vkBufs: Uint8Array[] = [];
      const witnessBufs: Uint8Array[] = [];
      const steps: any[] = unpack(ivcInputsBuf);
      for (const step of steps) {
        acirBufs.push(ungzip(step.bytecode));
        vkBufs.push(step.vk);
        witnessBufs.push(ungzip(step.witness));
      }
      const backend = new AztecClientBackend(acirBufs, {
        logger: console.log,
      });

      let iteration = 0;
      try {
        do {
          iteration++;
          statusDiv.innerText = `Iteration ${iteration}: Running Chonk proof generation...\n`;
          await backend.prove(witnessBufs, vkBufs);
          statusDiv.innerText += `✓ Iteration ${iteration} complete!\n`;
          statusDiv.style.backgroundColor = '#ccffcc';

          // Small delay to allow UI updates
          await new Promise(resolve => setTimeout(resolve, 100));
        } while (isLooping && !chonkShouldStop);
      } finally {
        // Clean up backend
        await backend.destroy();
      }

      chonkRunning = false;
      chonkButton.innerText = 'Run Chonk Proving';

      if (chonkShouldStop) {
        statusDiv.innerText += `\n⏸ Stopped after ${iteration} iterations.\n`;
      } else {
        statusDiv.innerText += '\n✓ Complete! Chonk proof generated.\n';
      }
      statusDiv.style.backgroundColor = '#ccffcc';
    } catch (error) {
      chonkRunning = false;
      chonkButton.innerText = 'Run Chonk Proving';
      logger.error('Error during Chonk proving:', error);
      statusDiv.innerText += '✗ Error during Chonk proving. Check console for details.\n';
      statusDiv.style.backgroundColor = '#ffcccc';
    }
  });
  chonkContainer.appendChild(chonkButton);
  document.body.appendChild(chonkContainer);
  document.body.appendChild(statusDiv);
});
