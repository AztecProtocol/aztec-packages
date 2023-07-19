#!/usr/bin/env node
import { createLogger } from '@aztec/foundation/log';

import { Command } from 'commander';
import fsExtra from 'fs-extra';
import fs from 'fs/promises';
import nodePath from 'path';

import { ContractCompiler } from './compile.js';
import { generateType } from './index.js';

const program = new Command();
const log = createLogger('noir-compiler-cli');

const main = async () => {
  program
    .name('aztec_noir_compiler')

    .command('compile')
    .argument('[path]', 'Path to the contract project', '.')
    .action(async (path: string) => {
      const projectPath = nodePath.resolve(path);

      const compiler = new ContractCompiler(projectPath);
      const contracts = await compiler.compile();

      const buildFolderPath = nodePath.join(projectPath, 'target');

      await fsExtra.mkdirp(buildFolderPath);

      for (const contract of contracts) {
        const contractPath = nodePath.join(buildFolderPath, `aztec-${contract.name}.json`);
        await fs.writeFile(contractPath, JSON.stringify(contract, null, 2));
      }
    })

    .command('typegen')
    .argument('[buildPath]', 'Path to the built artifact')
    .argument('[targetPath]', 'Path to the output file')
    .action(async (buildPath: string, targetPath: string) => {
      const artifact = fsExtra.readJSONSync(buildPath);
      const output = generateType(artifact);
      await fs.writeFile(targetPath, output);
      log(`Written type for ${artifact.name} to ${targetPath}`);
    });

  await program.parseAsync(process.argv);
};

main().catch(err => {
  log(`Error thrown: ${err}`);
  process.exit(1);
});
