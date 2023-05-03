#!/usr/bin/env node
import nodePath from 'path';
import fs from 'fs/promises';
import { Command } from 'commander';
import { ContractCompiler } from './compile.js';

const program = new Command();

const fileExists = async (path: string) => !!(await fs.stat(path).catch(e => false));

async function main() {
  program
    .command('compile')
    .argument('[path]', 'Path to the contract project', '.')
    .action(async (path: string) => {
      const projectPath = nodePath.resolve(path);

      const compiler = new ContractCompiler(projectPath);
      const contracts = await compiler.compile();

      const buildFolderPath = nodePath.join(projectPath, 'target');
      if (!(await fileExists(buildFolderPath))) {
        await fs.mkdir(buildFolderPath);
      }

      for (const contract of contracts) {
        const contractPath = nodePath.join(buildFolderPath, `aztec-${contract.name}.json`);
        await fs.writeFile(contractPath, JSON.stringify(contract, null, 2));
      }
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.log(`Error thrown: ${err}`);
  process.exit(1);
});
