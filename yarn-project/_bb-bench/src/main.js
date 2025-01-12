import { UltraHonkBackend } from '@aztec/bb.js';

import { Noir } from '@noir-lang/noir_js';
import createDebug from 'debug';

import main from '../main/target/main.json';
import recursion from '../recursion/target/recursion.json';

const logger = createDebug('bb-bench:');

/* eslint-disable no-console */

// Function to set up the output element and redirect all console output
function setupConsoleOutput() {
  const container = document.createElement('div');
  container.style.marginBottom = '10px';
  document.body.appendChild(container);

  const copyButton = document.createElement('button');
  copyButton.innerText = 'Copy Logs to Clipboard';
  copyButton.style.marginBottom = '10px';
  copyButton.addEventListener('click', () => {
    const logContent = logContainer.textContent || ''; // Get text content of log container
    navigator.clipboard
      .writeText(logContent)
      .then(() => {
        alert('Logs copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy logs:', err);
      });
  });
  container.appendChild(copyButton);

  const logContainer = document.createElement('pre');
  logContainer.id = 'logOutput';
  logContainer.style.border = '1px solid #ccc';
  logContainer.style.padding = '10px';
  logContainer.style.maxHeight = '400px';
  logContainer.style.overflowY = 'auto';
  container.appendChild(logContainer);

  // Helper to append messages to logContainer
  function addLogMessage(message) {
    logContainer.textContent += message + '\n';
    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to the bottom
  }

  // Override console methods to output clean logs
  const originalLog = console.log;
  const originalDebug = console.debug;

  console.log = function (...args) {
    const message = args
      .map(arg =>
        typeof arg === 'string'
          ? arg
              .replace(/%c/g, '')
              .replace(/color:.*?(;|$)/g, '')
              .trim()
          : arg,
      )
      .join(' ');
    originalLog.apply(console, args); // Keep original behavior
    addLogMessage(message);
  };

  console.debug = function (...args) {
    const message = args
      .map(arg =>
        typeof arg === 'string'
          ? arg
              .replace(/%c/g, '')
              .replace(/color:.*?(;|$)/g, '')
              .trim()
          : arg,
      )
      .join(' ');
    originalDebug.apply(console, args); // Keep original behavior
    addLogMessage(message);
  };
}

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

document.addEventListener('DOMContentLoaded', function () {
  setupConsoleOutput(); // Initialize console output capture
});
