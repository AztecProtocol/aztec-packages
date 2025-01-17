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
  container.appendChild(copyButton);

  const logContainer = document.createElement('pre');
  logContainer.id = 'logOutput';
  logContainer.style.border = '1px solid #ccc';
  logContainer.style.padding = '10px';
  logContainer.style.maxHeight = '400px';
  logContainer.style.overflowY = 'auto';
  container.appendChild(logContainer);

  /**
   * Appends a message to the log container and auto-scrolls to the bottom.
   * @param message - The log message to append.
   */
  function addLogMessage(message: string): void {
    logContainer.textContent += `${message}\n`;
    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to the bottom
  }

  // Add event listener to the copy button
  copyButton.addEventListener('click', () => {
    const logContent: string = logContainer.textContent || ''; // Get text content of log container
    navigator.clipboard
      .writeText(logContent)
      .then(() => {
        alert('Logs copied to clipboard!');
      })
      .catch((err: unknown) => {
        console.error('Failed to copy logs:', err);
      });
  });

  // List of console methods to override
  const methodsToOverride = ['log', 'debug', 'info', 'warn', 'error'] as const;
  type ConsoleMethod = (typeof methodsToOverride)[number];

  // Override each console method
  methodsToOverride.forEach((method: ConsoleMethod) => {
    // Preserve the original console method
    const originalMethod = console[method].bind(console);

    // Override the console method with type assertions
    console[method] = ((...args: any[]) => {
      // Process each argument to create a clean message
      const message: string = args
        .map(arg =>
          typeof arg === 'string'
            ? arg
                .replace(/%c/g, '')
                .replace(/color:.*?(;|$)/g, '')
                .trim()
            : JSON.stringify(arg),
        )
        .join(' ');

      // Call the original console method with the original arguments
      originalMethod(...args);

      // Append the formatted message to the log container with a prefix indicating the method
      addLogMessage(message);
    }) as Console[ConsoleMethod];
  });

  // Override the createDebug log function to capture its logs
  overrideCreateDebugLog(addLogMessage);
}

/**
 * Overrides the createDebug library's log function to capture debug logs.
 * @param addLogMessage - Function to append messages to the log container.
 */
function overrideCreateDebugLog(addLogMessage: (message: string) => void): void {
  // Preserve the original createDebug log function
  const originalDebugLog = createDebug.log.bind(createDebug);

  // Override the createDebug log function
  createDebug.log = (...args: any[]) => {
    // Call the original createDebug log function
    originalDebugLog(...args);

    // Process the arguments to form a message
    const message: string = args
      .map(arg =>
        typeof arg === 'string'
          ? arg
              .replace(/%c/g, '')
              .replace(/color:.*?(;|$)/g, '')
              .trim()
          : JSON.stringify(arg),
      )
      .join(' ');
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
