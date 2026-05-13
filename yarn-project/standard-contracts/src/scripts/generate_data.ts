// Copies the compiled AuthRegistry artifact from the noir-contracts build output into
// the standard-contracts artifacts directory, making it available for static imports.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');

const srcArtifact = path.join(repoRoot, 'noir-projects/noir-contracts/target/auth_registry_contract-AuthRegistry.json');
const destDir = path.join(__dirname, '../../artifacts');
const destArtifact = path.join(destDir, 'AuthRegistry.json');

async function generateDeclarationFile(destName: string) {
  const content = `
    import type { NoirCompiledContract } from '@aztec/stdlib/noir';
    const circuit: NoirCompiledContract;
    export = circuit;
  `;
  await fs.writeFile(path.join(destDir, `${destName}.d.json.ts`), content);
}

async function main() {
  await fs.mkdir(destDir, { recursive: true });
  await fs.copyFile(srcArtifact, destArtifact);
  await generateDeclarationFile('AuthRegistry');
  process.stdout.write('standard-contracts: copied AuthRegistry artifact\n');
}

try {
  await main();
} catch (err: unknown) {
  process.stderr.write(`Error copying standard contract artifacts: ${err}\n`);
  process.exit(1);
}
