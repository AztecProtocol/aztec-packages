import type { LogFn } from '@aztec/foundation/log';

import { Command } from 'commander';

import { parseAztecAddress, parseEthereumAddress, parseHex, parseOptionalInteger } from '../../utils/commands.js';

export function injectCommands(program: Command, log: LogFn) {
  const group = program
    .command('validator-keys')
    .aliases(['valKeys'])
    .description('Manage validator keystores for node operators');

  group
    .command('new')
    .summary('Generate a new validator keystore JSON')
    .description('Generates a new validator keystore with ETH secp256k1 accounts and optional BLS accounts')
    .option('--data-dir <path>', 'Directory to store keystore(s). Defaults to ~/.aztec/keystore')
    .option('--file <name>', 'Keystore file name. Defaults to key1.json (or keyN.json if key1.json exists)')
    .option('--count <N>', 'Number of validators to generate', parseOptionalInteger)
    .option('--publisher-count <N>', 'Number of publisher accounts per validator (default 1)', value =>
      parseOptionalInteger(value, 0),
    )
    .option('--mnemonic <mnemonic>', 'Mnemonic for ETH/BLS derivation')
    .option('--passphrase <str>', 'Optional passphrase for mnemonic')
    .option('--account-index <N>', 'Base account index for ETH derivation', parseOptionalInteger)
    .option('--address-index <N>', 'Base address index for ETH derivation', parseOptionalInteger)
    .option('--coinbase <address>', 'Coinbase ETH address to use when proposing', parseEthereumAddress)
    .option('--funding-account <address>', 'ETH account to fund publishers', parseEthereumAddress)
    .option('--remote-signer <url>', 'Default remote signer URL for accounts in this file')
    .option('--ikm <hex>', 'Initial keying material for BLS (alternative to mnemonic)', value => parseHex(value, 32))
    .option('--bls-path <path>', 'EIP-2334 path (default m/12381/3600/0/0/0)')
    .option('--bls-only', 'Generate only BLS keys')
    .option(
      '--password <str>',
      'Password for writing keystore files (ETH JSON V3 and BLS EIP-2335). Empty string allowed',
    )
    .option('--out-dir <dir>', 'Output directory for generated keystore file(s)')
    .option('--json', 'Echo resulting JSON to stdout')
    .requiredOption('--fee-recipient <address>', 'Aztec address that will receive fees', parseAztecAddress)
    .action(async options => {
      const { newValidatorKeystore } = await import('./new.js');
      await newValidatorKeystore(options, log);
    });

  group
    .command('add')
    .summary('Augment an existing validator keystore JSON')
    .description('Adds attester/publisher/BLS entries to an existing keystore using the same flags as new')
    .argument('<existing>', 'Path to existing keystore JSON')
    .option('--data-dir <path>', 'Directory where keystore(s) live')
    .option('--file <name>', 'Override output file name')
    .option('--count <N>', 'Number of validators to add', parseOptionalInteger)
    .option('--publisher-count <N>', 'Number of publisher accounts per validator (default 1)', value =>
      parseOptionalInteger(value, 0),
    )
    .option('--mnemonic <mnemonic>', 'Mnemonic for ETH/BLS derivation')
    .option('--passphrase <str>', 'Optional passphrase for mnemonic')
    .option('--account-index <N>', 'Base account index for ETH derivation', parseOptionalInteger)
    .option('--address-index <N>', 'Base address index for ETH derivation', parseOptionalInteger)
    .option('--coinbase <address>', 'Coinbase ETH address to use when proposing', parseEthereumAddress)
    .option('--funding-account <address>', 'ETH account to fund publishers', parseEthereumAddress)
    .option('--remote-signer <url>', 'Default remote signer URL for accounts in this file')
    .option('--ikm <hex>', 'Initial keying material for BLS (alternative to mnemonic)', value => parseHex(value, 32))
    .option('--bls-path <path>', 'EIP-2334 path (default m/12381/3600/0/0/0)')
    .option('--bls-only', 'Generate only BLS keys')
    .option('--empty', 'Generate an empty skeleton without keys')
    .option(
      '--password <str>',
      'Password for writing keystore files (ETH JSON V3 and BLS EIP-2335). Empty string allowed',
    )
    .option('--out-dir <dir>', 'Output directory for generated keystore file(s)')
    .option('--json', 'Echo resulting JSON to stdout')
    .requiredOption('--fee-recipient <address>', 'Aztec address that will receive fees', parseAztecAddress)
    .action(async (existing: string, options) => {
      const { addValidatorKeys } = await import('./add.js');
      await addValidatorKeys(existing, options, log);
    });

  // top-level convenience: aztec generate-bls-keypair
  program
    .command('generate-bls-keypair')
    .description('Generate a BLS keypair with convenience flags')
    .option('--mnemonic <mnemonic>', 'Mnemonic for BLS derivation')
    .option('--ikm <hex>', 'Initial keying material for BLS (alternative to mnemonic)', value => parseHex(value, 32))
    .option('--bls-path <path>', 'EIP-2334 path (default m/12381/3600/0/0/0)')
    .option('--g2', 'Derive on G2 subgroup')
    .option('--compressed', 'Output compressed public key')
    .option('--json', 'Print JSON output to stdout')
    .option('--out <file>', 'Write output to file')
    .action(async options => {
      const { generateBlsKeypair } = await import('./generate_bls_keypair.js');
      await generateBlsKeypair(options, log);
    });

  return program;
}
