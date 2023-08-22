#!/usr/bin/env node

import assert from 'node:assert';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'node:path';
import { describe, it, before } from 'node:test';

import { exec } from 'node:child_process';

const scriptDirectory = getScriptDirectory();
const executableScriptLocation = '../dest/node/main.js';
const executionScript = path.join(scriptDirectory, executableScriptLocation);
const compiledNoirProgramLocation = path.join(scriptDirectory, 'target/main.json');
const solvedWitnessLocation = path.join(scriptDirectory, 'target/witness.tr');
const expectedBarretenbergWasmLocation = path.join(scriptDirectory, '../dest/barretenberg.wasm');
const expectedBarretenbergWasmThreadsLocation = path.join(scriptDirectory, '../dest/barretenberg-threads.wasm');
const possibleBarretenbergWasmLocation = path.join(scriptDirectory, '../../cpp/build-wasm/bin/barretenberg.wasm');
const possibleBarretenbergWasmThreadsLocation = path.join(
  scriptDirectory,
  '../../cpp/build-wasm-threads/bin/barretenberg.wasm',
);

// Skips warnings, ie. experimental features
process.removeAllListeners('warning');

function getScriptDirectory() {
  const moduleURL = import.meta.url;
  const modulePath = fileURLToPath(moduleURL);
  const scriptDirectory = path.dirname(modulePath);

  return scriptDirectory;
}

function copyBBWASMIfNotPresent(expectedLocation, possibleBuildLocation) {
  if (!fs.existsSync(expectedLocation)) {
    try {
      fs.copyFileSync(possibleBuildLocation, expectedLocation);
      console.log(`${possibleBuildLocation} copied to ${expectedLocation}`);
    } catch (error) {
      console.error(`Error copying file ${possibleBuildLocation} to ${expectedLocation}:`, error);
      console.error('Have you build with `yarn build` ?');
      throw error;
    }
  }
}

function throwMissingFile(filePath, message) {
  const fileExists = fs.existsSync(filePath);
  if (!fileExists) {
    console.error(`File does not exist at ${filePath}, ${message}.`);
    throw Error(`File does not exist at ${filePath}, ${message}.`);
  }
}

function checkArtifactsPresent() {
  copyBBWASMIfNotPresent(expectedBarretenbergWasmLocation, possibleBarretenbergWasmLocation);
  copyBBWASMIfNotPresent(expectedBarretenbergWasmThreadsLocation, possibleBarretenbergWasmThreadsLocation);

  throwMissingFile(executionScript, "execute 'yarn build:ts:node' first");

  throwMissingFile(compiledNoirProgramLocation, "execute 'nargo compile' first");

  throwMissingFile(solvedWitnessLocation, "execute 'nargo execute' first");
}

function executeBBCli(command) {
  // const extendedEnv = Object.assign({}, process.env, {
  //   DEBUG: '*',
  // });
  // exec(
  //   command,
  //   {
  //     cwd: scriptDirectory,
  //     // env: extendedEnv,
  //   },
  //   function (error, stdout, stderr) {
  //     if (error) {
  //       done(error);
  //       return;
  //     }

  //     // Assert that the stdout matches the expected output template
  //     assert.match(stdout.trim(), expectedOutputTemplate);

  //     // Since no error from execution and assert matched expected template
  //     // this is now understood as correct execution.
  //     done();
  //   },
  // );

  return new Promise((resolve, reject) => {
    const childProcess = exec(
      command,
      {
        cwd: scriptDirectory,
        // env: extendedEnv,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      },
    );

    childProcess.on('exit', code => {
      if (code !== 0) {
        reject(new Error(`Command '${command}' exited with code ${code}`));
      }
    });
  });
}

describe('Test bb subcommands', () => {
  before(checkArtifactsPresent);

  it('get gate count using `bb gates` command', async () => {
    const expectedOutputTemplate = /^\d+$/gm;
    const command = `${executionScript} gates`;

    const {stdout, stderr} = await executeBBCli(command);
    assert.match(stdout.trim(), expectedOutputTemplate);
    
  });

  it('creates proof with `bb prove -o proof` command', async () => {
    // We expect any character stream since binary print is result of this command
    const expectedOutputTemplate = /.+/;
    const command = `${executionScript} prove -o proof`;

    const {stdout, stderr} = await executeBBCli(command);
    assert.match(stdout.trim(), expectedOutputTemplate);
  });

  it('writes verification key with `bb write_vk -o vk` command', async () => {
    // We expect any character stream since binary print is result of this command
    const expectedOutputTemplate = /.+/;
    const command = `${executionScript} write_vk -o vk`;

    const {stdout, stderr} = await executeBBCli(command);
    assert.match(stdout.trim(), expectedOutputTemplate);
  });

  it('verifies proof with `bb verify -k vk -p proof` command', async () => {
    const expectedOutputTemplate = /true/;
    const command = `${executionScript} verify -k vk -p proof`;

    const {stdout, stderr} = await executeBBCli(command);
    assert.match(stdout.trim(), expectedOutputTemplate);
  });
});
