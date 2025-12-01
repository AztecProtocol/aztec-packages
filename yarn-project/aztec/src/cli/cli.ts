import type { LogFn, Logger } from '@aztec/foundation/log';

import { Command } from 'commander';

import { aztecStartOptions } from './aztec_start_options.js';
import { addOptions, printAztecStartHelpText } from './util.js';

/**
 * Returns commander program that defines the 'aztec' command line interface.
 * @param userLog - log function for logging user output.
 * @param debugLogger - logger for logging debug messages.
 */
export function injectAztecCommands(program: Command, userLog: LogFn, debugLogger: Logger): Command {
  const startCmd = new Command('start').description(
    'Starts Aztec modules. Options for each module can be set as key-value pairs (e.g. "option1=value1,option2=value2") or as environment variables.',
  );

  // Assuming commands are added elsewhere, here we just add options to the main program
  Object.keys(aztecStartOptions).forEach(category => {
    addOptions(startCmd, aztecStartOptions[category]);
  });

  startCmd.helpInformation = printAztecStartHelpText;

  startCmd.action(async options => {
    const { aztecStart } = await import('./aztec_start_action.js');
    return await aztecStart(options, userLog, debugLogger);
  });

  program.addCommand(startCmd);

  program.configureHelp({ sortSubcommands: true });

  program.addHelpText(
    'after',
    `

  Additional commands:

    init [folder] [options]: creates a new Noir project
      Options:
        --name <name>       Name of the package
        --contract          Use a contract template (default)
        --lib               Use a library template
        --bin               Use a binary template
      Examples:
        $ aztec init                    # creates a contract project in current directory
        $ aztec init --lib              # creates a library project

    new <path> [options]: creates a new Noir project in a new directory
      Options:
        --name <name>       Name of the package
        --contract          Use a contract template (default)
        --lib               Use a library template
        --bin               Use a binary template
      Examples:
        $ aztec new my-project          # creates a contract project in ./my-project
        $ aztec new my-lib --lib        # creates a library project in ./my-lib

    compile [options]: compiles Aztec Noir contracts
      Compiles contracts with nargo compile and then postprocesses them to generate Aztec-specific artifacts including:
        - Transpiled contract artifacts
        - Verification keys
      The compiled contracts will be placed in the target/ directory by default.
      Supports standard nargo compile options.

    fmt [options]: formats Noir code using nargo fmt
      Example:
        $ aztec fmt                     # formats all Noir files in the project

    check [options]: type-checks Noir code without compiling using nargo check
      Example:
        $ aztec check                   # checks all Noir files in the project

    test [options]: starts a dockerized TXE node via
      $ aztec start --txe
    then runs
      $ aztec test --silence-warnings --oracle-resolver=<TXE_ADDRESS> [options]

    lsp: starts the Nargo Language Server Protocol server
      Runs nargo lsp in a Docker container for IDE integration with Noir.
      This command is typically used by IDE extensions and not called directly by users.
      Example:
        $ aztec lsp                     # starts the LSP server

    preload-crs: Downloads and caches the Common Reference String (CRS) data required for zero-knowledge proofs.
      Example:
        $ aztec preload-crs             # preloads CRS data
    `,
  );

  program
    .command('preload-crs')
    .description('Preload the points data needed for proving and verifying')
    .action(async options => {
      const { preloadCrs } = await import('./preload_crs.js');
      return await preloadCrs(options, userLog, debugLogger);
    });

  return program;
}
