import { createConsoleLogger } from '@aztec/foundation/log';

import { codegen } from '@noir-lang/noir_codegen';
import { type CompiledCircuit } from '@noir-lang/types';
import { pascalCase } from 'change-case';
import { promises as fs } from 'fs';

const log = createConsoleLogger('mock-circuits');

const circuits = ['circuit_1', 'circuit_2'];

const main = async () => {
  try {
    await fs.access('./src/types/');
  } catch (error) {
    await fs.mkdir('./src/types', { recursive: true });
  }
  const programs: [string, CompiledCircuit][] = [];
  // Collect all circuits
  for (const circuit of circuits) {
    const rawData = await fs.readFile(`./artifacts/${circuit}.json`, 'utf-8');
    const abiObj: CompiledCircuit = JSON.parse(rawData);
    programs.push([pascalCase(circuit), abiObj]);
  }
  const code = codegen(
    programs,
    false, // Don't embed artifacts
    true, // Use fixed length arrays
  );
  await fs.writeFile('./src/types/index.ts', code);
};

try {
  await main();
} catch (err: unknown) {
  log(`Error generating types ${err}`);
  process.exit(1);
}
