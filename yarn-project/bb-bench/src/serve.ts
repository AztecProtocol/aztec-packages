import createDebug from 'debug';

import FirstVk from '../artifacts/keys/first.vk.data.json' assert { type: 'json' };
import SecondVk from '../artifacts/keys/second.vk.data.json' assert { type: 'json' };
import {
  generateFirstCircuit,
  generateSecondCircuit,
  logger,
  proveThenVerifyUltraHonk,
  proveUltraHonk,
} from './index.js';

createDebug.enable('*'); // needed for logging in Firefox but not Chrome

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
  function addLogMessage(message: string) {
    logContainer.textContent += message + '\n';
    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to the bottom
  }

  // Override console methods to output clean logs
  const originalLog = console.log;
  const originalDebug = console.debug;

  console.log = (...args: any[]) => {
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

  console.debug = (...args: any[]) => {
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

function hexStringToUint8Array(hex: string): Uint8Array {
  const length = hex.length / 2;
  const uint8Array = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const byte = hex.substr(i * 2, 2);
    uint8Array[i] = parseInt(byte, 16);
  }

  return uint8Array;
}

document.addEventListener('DOMContentLoaded', function () {
  setupConsoleOutput(); // Initialize console output capture

  const button = document.createElement('button');
  button.innerText = 'Run Test';
  button.addEventListener('click', async () => {
    logger(`generating circuit and witness...`);
    const [bytecode1, witness1] = await generateFirstCircuit();
    logger(`done generating circuit and witness. proving...`);
    const proverOutput = await proveUltraHonk(bytecode1, witness1);
    logger(`done proving. generating second circuit and witness...`);
    const [bytecode2, witness2] = await generateSecondCircuit(proverOutput, FirstVk.keyAsFields);
    logger(`done. generating circuit and witness. proving then verifying...`);
    const verified = await proveThenVerifyUltraHonk(bytecode2, witness2, hexStringToUint8Array(SecondVk.keyAsBytes));
    logger(`verified? ${verified}`);
  });
  document.body.appendChild(button);
});
