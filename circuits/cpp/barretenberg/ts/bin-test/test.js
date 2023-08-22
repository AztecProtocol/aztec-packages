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

function executeBBCli(command, expectedOutputTemplate, done) {
  // const extendedEnv = Object.assign({}, process.env, {
  //   DEBUG: '*',
  // });
  exec(
    command,
    {
      cwd: scriptDirectory,
      // env: extendedEnv,
    },
    function (error, stdout, stderr) {
      if (error) {
        done(error);
        return;
      }

      // Assert that the stdout matches the expected output template
      assert.match(stdout.trim(), expectedOutputTemplate);

      // Since no error from execution and assert matched expected template 
      // this is now understood as correct execution. 
      done();
    },
  );
}

describe('Test bb subcommands', () => {
  before(checkArtifactsPresent);

  it('get gate count using `bb gates` command', done => {
    const expectedOutputTemplate = /^\d+$/gm;
    const command = `${executionScript} gates`;

    executeBBCli(command, expectedOutputTemplate, done);
  });

  it('creates proof with `bb prove -o proof` command', done => {
    // We expect any character stream since binary print is result of this command
    const expectedOutputTemplate = /.+/;
    const command = `${executionScript} prove -o proof`;

    executeBBCli(command, expectedOutputTemplate, done);
  });

  it('writes verification key with `bb write_vk -o vk` command', done => {
    // We expect any character stream since binary print is result of this command
    const expectedOutputTemplate = /.+/;
    const command = `${executionScript} write_vk -o vk`;

    executeBBCli(command, expectedOutputTemplate, done);
  });

  it('verifies proof with `bb verify -k vk -p proof` command', done => {
    const expectedOutputTemplate = /true/;
    const command = `${executionScript} verify -k vk -p proof`;

    executeBBCli(command, expectedOutputTemplate, done);
  });
});
