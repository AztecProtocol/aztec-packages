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

/**
 * Parses console log arguments with %c and corresponding styles.
 * @param args - The arguments passed to console methods.
 * @returns An HTML string with styles applied.
 */
function parseConsoleArgs(args: any[]): string {
  if (typeof args[0] !== 'string') {
    // If the first argument is not a string, stringify all arguments
    return args.map(arg => escapeHTML(typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ');
  }

  const format = args[0];
  const styleArgs = args.slice(1);

  const parts = format.split('%c');
  const htmlParts: string[] = [];

  for (let i = 0; i < parts.length; i++) {
    const text = escapeHTML(parts[i]);
    const style = styleArgs[i] || '';

    if (i === 0) {
      // The first part may not have a style
      htmlParts.push(text);
    } else {
      htmlParts.push(`<span style="${style}">${text}</span>`);
    }
  }

  return htmlParts.join('');
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param str - The string to escape.
 * @returns The escaped string.
 */
function escapeHTML(str: string): string {
  return str.replace(/[&<>"']/g, function (match) {
    const escape: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escape[match];
  });
}

/**
 * Sets up the output element and redirects all console output.
 */
function setupConsoleOutput(): void {
  const container: HTMLDivElement = document.createElement('div');
  container.style.marginBottom = '10px';
  document.body.appendChild(container);

  const copyButton: HTMLButtonElement = document.createElement('button');
  copyButton.innerText = 'Copy Logs to Clipboard';
  copyButton.style.marginBottom = '10px';
  container.appendChild(copyButton);

  const logContainer: HTMLDivElement = document.createElement('div');
  logContainer.id = 'logOutput';
  logContainer.style.border = '1px solid #ccc';
  logContainer.style.padding = '10px';
  logContainer.style.maxHeight = '400px';
  logContainer.style.overflowY = 'auto';
  logContainer.style.backgroundColor = '#1e1e1e'; // Dark background for better contrast
  logContainer.style.color = '#ffffff'; // Default text color
  logContainer.style.fontFamily = 'monospace'; // Monospaced font for better readability
  container.appendChild(logContainer);

  /**
   * Appends a message to the log container with proper HTML formatting.
   * @param message - The log message to append.
   */
  function addLogMessage(message: string): void {
    const messageElement: HTMLDivElement = document.createElement('div');
    messageElement.innerHTML = message;
    logContainer.appendChild(messageElement);
    logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to the bottom
  }

  // Add event listener to the copy button
  copyButton.addEventListener('click', () => {
    const logContent: string = logContainer.innerText || ''; // Get text content of log container
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

    // Override the console method
    console[method] = ((...args: any[]) => {
      // Parse the console arguments to HTML
      const htmlMessage = parseConsoleArgs(args);

      // Call the original console method with the original arguments
      originalMethod(...args);

      // Append the formatted message to the log container
      addLogMessage(htmlMessage);
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

    // Parse the console arguments to HTML
    const htmlMessage = parseConsoleArgs(args);

    // Append the formatted message to the log container
    addLogMessage(htmlMessage);
  };
}

/**
 * Converts a hexadecimal string to a Uint8Array.
 * @param hex - The hexadecimal string.
 * @returns A Uint8Array representation of the hex string.
 */
function hexStringToUint8Array(hex: string): Uint8Array {
  const length = Math.ceil(hex.length / 2);
  const uint8Array = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const byte = hex.substr(i * 2, 2);
    uint8Array[i] = parseInt(byte, 16);
  }

  return uint8Array;
}

// Initialize console output capture and set up event listeners after DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
  setupConsoleOutput(); // Initialize console output capture

  const button: HTMLButtonElement = document.createElement('button');
  button.innerText = 'Run Test';
  button.style.marginTop = '10px';
  button.style.padding = '5px 10px';
  button.style.cursor = 'pointer';
  button.addEventListener('click', async () => {
    logger('generating circuit and witness...');
    const [bytecode1, witness1] = await generateFirstCircuit();
    logger('done generating circuit and witness. proving...');
    const proverOutput = await proveUltraHonk(bytecode1, witness1);
    logger('done proving. generating second circuit and witness...');
    const [bytecode2, witness2] = await generateSecondCircuit(proverOutput, FirstVk.keyAsFields);
    logger('done. generating circuit and witness. proving then verifying...');
    const verified = await proveThenVerifyUltraHonk(bytecode2, witness2, hexStringToUint8Array(SecondVk.keyAsBytes));
    logger(`verified? ${verified}`);
  });
  document.body.appendChild(button);
});
