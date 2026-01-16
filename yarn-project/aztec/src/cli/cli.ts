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

  if (process.env.AZTEC_SHELL_WRAPPER) {
    program.addHelpText(
      'after',
      `
Additional commands:

  init [folder] [options]  creates a new Aztec Noir project.
  new <path> [options]     creates a new Aztec Noir project in a new directory.
  compile [options]        compiles Aztec Noir contracts.
  test [options]           starts a TXE and runs "nargo test" using it as the oracle resolver.
    `,
    );
  }

  program
    .command('preload-crs')
    .description('Preload the points data needed for proving and verifying')
    .action(async options => {
      const { preloadCrs } = await import('./preload_crs.js');
      return await preloadCrs(options, userLog, debugLogger);
    });

  return program;
}
