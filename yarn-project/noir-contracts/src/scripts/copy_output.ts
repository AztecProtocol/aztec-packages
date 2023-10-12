import { ContractArtifact } from '@aztec/foundation/abi';
import { createConsoleLogger } from '@aztec/foundation/log';
import {
  generateContractArtifact,
  generateNoirContractInterface,
  generateTypescriptContractInterface,
} from '@aztec/noir-compiler';

import { readFileSync, writeFileSync } from 'fs';
import camelCase from 'lodash.camelcase';
import omit from 'lodash.omit';
import snakeCase from 'lodash.snakecase';
import upperFirst from 'lodash.upperfirst';
import { join as pathJoin } from 'path';
import { format } from 'util';

// const STATEMENT_TYPES = ['type', 'params', 'return'] as const;
const log = createConsoleLogger('aztec:noir-contracts');

const PROJECT_CONTRACTS = [
  { name: 'SchnorrSingleKeyAccount', target: '../aztec.js/src/artifacts/', exclude: [] },
  { name: 'SchnorrAccount', target: '../aztec.js/src/artifacts/', exclude: [] },
  { name: 'EcdsaAccount', target: '../aztec.js/src/artifacts/', exclude: [] },
];

const INTERFACE_CONTRACTS = ['private_token', 'private_token_airdrop', 'test'];

/**
 * Writes the contract to a specific project folder, if needed.
 * @param artifact - The artifact to write.
 */
function writeToProject(artifact: any) {
  for (const projectContract of PROJECT_CONTRACTS) {
    if (artifact.name === projectContract.name) {
      const toWrite = {
        ...artifact,
        functions: artifact.functions.map((f: any) => omit(f, projectContract.exclude)),
        // If we maintain debug symbols they will get committed to git.
        debug: undefined,
      };
      const targetFilename = pathJoin(projectContract.target, `${snakeCase(artifact.name)}_contract.json`);
      writeFileSync(targetFilename, JSON.stringify(toWrite, null, 2) + '\n');
      log(`Written ${targetFilename}`);
    }
  }
}

const main = () => {
  const name = process.argv[2];
  if (!name) throw new Error(`Missing argument contract name`);

  const projectName = `${snakeCase(name)}_contract`;

  const contractName = upperFirst(camelCase(name));
  const artifactFile = `${projectName}-${contractName}.json`;

  const buildJsonFilePath = `./target/${artifactFile}`;
  const buildJson = JSON.parse(readFileSync(buildJsonFilePath).toString());

  const debugArtifactFile = `debug_${artifactFile}`;
  let debug = undefined;

  try {
    const debugJsonFilePath = `./target/${debugArtifactFile}`;
    const debugJson = JSON.parse(readFileSync(debugJsonFilePath).toString());
    if (debugJson) {
      debug = debugJson;
    }
  } catch (err) {
    // Ignore
  }

  // Remove extraneous information from the buildJson (which was output by Nargo) to hone in on the function data we actually care about:
  const artifactJson: ContractArtifact = generateContractArtifact({ contract: buildJson, debug });

  // Write the artifact:
  const artifactsDir = 'src/artifacts';
  const artifactFileName = `${snakeCase(name)}_contract.json`;
  writeFileSync(pathJoin(artifactsDir, artifactFileName), JSON.stringify(artifactJson, null, 2) + '\n');
  log(`Written ${pathJoin(artifactsDir, artifactFileName)}`);

  // Write some artifacts to other packages in the monorepo:
  writeToProject(artifactJson);

  // Write a .ts contract interface, for consumption by the typescript code
  const tsInterfaceDestFilePath = `src/types/${name}.ts`;
  const tsAbiImportPath = `../artifacts/${artifactFileName}`;
  writeFileSync(tsInterfaceDestFilePath, generateTypescriptContractInterface(artifactJson, tsAbiImportPath));
  log(`Written ${tsInterfaceDestFilePath}`);

  // Write a .nr contract interface, for consumption by other Aztec.nr contracts
  if (INTERFACE_CONTRACTS.includes(name)) {
    const projectDirPath = `src/contracts/${projectName}`;
    const noirInterfaceDestFilePath = `${projectDirPath}/src/interface.nr`;
    try {
      writeFileSync(noirInterfaceDestFilePath, generateNoirContractInterface(artifactJson));
      log(`Written ${noirInterfaceDestFilePath}`);
    } catch (err) {
      log(`Error generating Aztec.nr interface for ${name}: ${err}`);
    }
  }
};

try {
  main();
} catch (err: unknown) {
  log(format(`Error copying build output`, err));
  process.exit(1);
}
