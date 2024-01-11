import { loadContractArtifact } from '@aztec/types/abi';

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import path from 'path';

import { generateNoirContractInterface } from '../contract-interface-gen/noir.js';
import { generateTypescriptContractInterface } from '../contract-interface-gen/typescript.js';

/** Options for code generation */
type GenerateCodeOpts = { /** Typescript */ ts: boolean; /** Noir */ nr: boolean };

/** Generate noir or typescript interface for a given contract. */
export function generateCode(outputPath: string, fileOrDirPath: string, opts: GenerateCodeOpts) {
  const stats = statSync(fileOrDirPath);

  if (stats.isDirectory()) {
    const files = readdirSync(fileOrDirPath).filter(file => file.endsWith('.json') && !file.startsWith('debug_'));
    for (const file of files) {
      const fullPath = path.join(fileOrDirPath, file);
      generateFromNoirArtifact(outputPath, fullPath, opts);
    }
  } else if (stats.isFile()) {
    generateFromNoirArtifact(outputPath, fileOrDirPath, opts);
  }
}

/** Writes noir or typescript interfaces from a given noir artifact */
function generateFromNoirArtifact(outputPath: string, noirArtifactPath: string, opts: GenerateCodeOpts) {
  const { nr, ts } = opts;
  const noirArtifact = JSON.parse(readFileSync(noirArtifactPath, 'utf8'));
  const aztecArtifact = loadContractArtifact(noirArtifact);

  mkdirSync(outputPath, { recursive: true });

  if (nr) {
    const noirContract = generateNoirContractInterface(aztecArtifact);
    writeFileSync(`${outputPath}/${aztecArtifact.name}.nr`, noirContract);
    return;
  }

  if (ts) {
    const tsWrapper = generateTypescriptContractInterface(aztecArtifact, `./${aztecArtifact.name}.json`);
    writeFileSync(`${outputPath}/${aztecArtifact.name}.ts`, tsWrapper);
  }
}
