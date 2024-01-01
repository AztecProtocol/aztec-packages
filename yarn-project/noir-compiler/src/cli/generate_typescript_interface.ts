import { mkdir, readFile, writeFile } from 'fs/promises';

import { generateContractArtifact } from '../contract-interface-gen/abi.js';
import { generateTypescriptContractInterface } from '../contract-interface-gen/contractTypescript.js';

export async function generateTypescriptInterfaceFromNoirAbi(
  outputPath: string,
  noirAbiPath: string,
  noirDebugPath?: string,
) {
  const contract = JSON.parse(await readFile(noirAbiPath, 'utf8'));
  const debug = noirDebugPath ? JSON.parse(await readFile(noirDebugPath, 'utf8')) : undefined;
  const aztecAbi = generateContractArtifact({ contract, debug });
  const tsWrapper = generateTypescriptContractInterface(aztecAbi, `./${aztecAbi.name}.json`);
  await mkdir(outputPath, { recursive: true });
  await writeFile(`${outputPath}/${aztecAbi.name}.ts`, tsWrapper);
  await writeFile(`${outputPath}/${aztecAbi.name}.json`, JSON.stringify(aztecAbi, undefined, 2));
}
