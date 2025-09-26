import type { LogFn, Logger } from '@aztec/foundation/log';

import type { Command } from 'commander';

import { ETHEREUM_HOSTS, l1ChainIdOption, nodeOption, parseEthereumAddress } from '../../utils/commands.js';

export function injectCommands(program: Command, log: LogFn, debugLogger: Logger) {
  program
    .command('bootstrap-network')
    .description('Bootstrap a new network')
    .addOption(nodeOption)
    .addOption(l1ChainIdOption)
    .requiredOption<string[]>(
      '--l1-rpc-urls <string>',
      'List of Ethereum host URLs. Chain identifiers localhost and testnet can be used (comma separated)',
      (arg: string) => arg.split(','),
      [ETHEREUM_HOSTS],
    )
    .option('--l1-private-key <string>', 'The private key to use for deployment', process.env.PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .option(
      '-ai, --address-index <number>',
      'The address index to use when calculating an address',
      arg => BigInt(arg),
      0n,
    )
    .option('--json', 'Output the result as JSON')
    .action(async options => {
      const { bootstrapNetwork } = await import('./bootstrap_network.js');
      await bootstrapNetwork(
        options[nodeOption.attributeName()],
        options.l1RpcUrls,
        options[l1ChainIdOption.attributeName()],
        options.l1PrivateKey,
        options.mnemonic,
        options.addressIndex,
        options.json,
        log,
        debugLogger,
      );
    });

  program
    .command('drip-faucet')
    .description('Drip the faucet')
    .requiredOption('-u, --faucet-url <string>', 'Url of the faucet', 'http://localhost:8082')
    .requiredOption('-t, --token <string>', 'The asset to drip', 'eth')
    .requiredOption('-a, --address <string>', 'The Ethereum address to drip to', parseEthereumAddress)
    .option('--json', 'Output the result as JSON')
    .action(async options => {
      const { dripFaucet } = await import('./faucet.js');
      await dripFaucet(options.faucetUrl, options.token, options.address, options.json, log);
    });

  return program;
}
