import { mkdir, readFile, writeFile } from 'fs/promises';

import { generateContractArtifact } from '../contract-interface-gen/abi.js';
import { generateNoirContractInterface } from '../contract-interface-gen/noir.js';

export async function generateNoirInterfaceFromNoirAbi(outputPath: string, noirAbiPath: string) {
  const contract = JSON.parse(await readFile(noirAbiPath, 'utf8'));
  const aztecAbi = generateContractArtifact({ contract });
  const noirContract = generateNoirContractInterface(aztecAbi);
  await mkdir(outputPath, { recursive: true });
  await writeFile(`${outputPath}/${aztecAbi.name}.nr`, noirContract);
}
