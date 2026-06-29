import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { LogFn } from '@aztec/foundation/log';
import { createProverNodeAdminClient } from '@aztec/stdlib/interfaces/server';

import { type Command, InvalidArgumentError } from 'commander';

function parseEpoch(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new InvalidArgumentError('Epoch must be a non-negative integer.');
  }
  return parsed;
}

export function injectProverCommand(program: Command, log: LogFn): Command {
  const proverCommand = program.command('prover').description('Operate a prover node via its admin JSON-RPC endpoint');

  proverCommand
    .command('start-proof')
    .description('Schedules proving for the given epoch')
    .requiredOption('--epoch <n>', 'Epoch number to prove', parseEpoch)
    .requiredOption('--admin-url <url>', 'URL of the prover node admin JSON-RPC endpoint')
    .option('--api-key <key>', 'Admin API key', process.env.AZTEC_ADMIN_API_KEY)
    .action(async options => {
      const client = createProverNodeAdminClient(options.adminUrl, {}, undefined, options.apiKey);
      const jobId = await client.startProof(options.epoch);
      log(`Started proving job ${jobId} for epoch ${options.epoch}`);
    });

  proverCommand
    .command('get-jobs')
    .description('Lists the prover node proving jobs')
    .requiredOption('--admin-url <url>', 'URL of the prover node admin JSON-RPC endpoint')
    .option('--api-key <key>', 'Admin API key', process.env.AZTEC_ADMIN_API_KEY)
    .action(async options => {
      const client = createProverNodeAdminClient(options.adminUrl, {}, undefined, options.apiKey);
      const jobs = await client.getJobs();
      log(jsonStringify(jobs, true));
    });

  return program;
}
