#!/usr/bin/env node
import nodePath from 'path';
import { Command } from 'commander';
import { ContractCompiler } from './compile.js';

const program = new Command();

async function main() {
  program
    .command('compile')
    .argument('[path]', 'Path to the contract project', '.')
    .action(async (path: string) => {
      const compiler = new ContractCompiler(nodePath.join(process.cwd(), path));
      await compiler.compile();
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  console.log(`Error thrown: ${err}`);
  process.exit(1);
});
