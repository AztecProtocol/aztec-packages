// Copies the compiled canonical contract artifacts from the noir-contracts build output into
// the canonical-contracts artifacts directory, making them available for static imports.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../');

const destDir = path.join(__dirname, '../../artifacts');

const artifacts: { srcName: string; destName: string }[] = [
  { srcName: 'auth_registry_contract-AuthRegistry', destName: 'AuthRegistry' },
  { srcName: 'public_checks_contract-PublicChecks', destName: 'PublicChecks' },
];

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
  for (const { srcName, destName } of artifacts) {
    const srcArtifact = path.join(repoRoot, `noir-projects/noir-contracts/target/${srcName}.json`);
    const destArtifact = path.join(destDir, `${destName}.json`);
    await fs.copyFile(srcArtifact, destArtifact);
    await generateDeclarationFile(destName);
    process.stdout.write(`canonical-contracts: copied ${destName} artifact\n`);
  }
}

try {
  await main();
} catch (err: unknown) {
  process.stderr.write(`Error copying canonical contract artifacts: ${err}\n`);
  process.exit(1);
}
