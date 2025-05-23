import { createLogger } from '@aztec/foundation/log';

import { generate3FunctionTestingIVCStack } from './index.js';
import { proveThenVerifyAztecClient } from './prove_wasm.js';

const logger = createLogger('aztec:ivc-test');

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

(window as any).proveThenVerifyAztecClient = proveThenVerifyAztecClient;

document.addEventListener('DOMContentLoaded', function () {
  setupConsoleOutput(); // Initialize console output capture

  const button = document.createElement('button');
  button.innerText = 'Run Test';
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  button.addEventListener('click', async () => {
    logger.info(`generating circuit and witness...`);
    const [bytecodes, witnessStack] = await generate3FunctionTestingIVCStack();
    logger.info(`done. proving and verifying...`);
    const verified = await proveThenVerifyAztecClient(bytecodes, witnessStack);
    logger.info(`verified? ${verified}`);
  });
  document.body.appendChild(button);
});
