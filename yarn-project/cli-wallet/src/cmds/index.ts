import { PXE } from '@aztec/aztec.js';
import { PublicKeys } from '@aztec/circuits.js';
import {
  addOptions,
  createPrivateKeyOption,
  logJson,
  parseAztecAddress,
  parseFieldFromHexString,
  parsePublicKey,
  pxeOption,
} from '@aztec/cli/utils';
import { DebugLogger, LogFn } from '@aztec/foundation/log';

import { Command } from 'commander';

import { FeeOpts } from '../fees.js';

export function injectCommands(program: Command, log: LogFn, debugLogger: DebugLogger) {
  const createAccountCommand = program
    .command('create-account')
    .description(
      'Creates an aztec account that can be used for sending transactions. Registers the account on the PXE and deploys an account contract. Uses a Schnorr single-key account which uses the same key for encryption and authentication (not secure for production usage).',
    )
    .summary('Creates an aztec account that can be used for sending transactions.')
    .option(
      '--skip-initialization',
      'Skip initializing the account contract. Useful for publicly deploying an existing account.',
    )
    .option('--public-deploy', 'Publicly deploys the account and registers the class if needed.')
    .addOption(createPrivateKeyOption('Private key for account. Uses random by default.', false));

  addOptions(createAccountCommand, FeeOpts.getOptions())
    .option(
      '--register-only',
      'Just register the account on the PXE. Do not deploy or initialize the account contract.',
    )
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction')
    .action(async args => {
      const { createAccount } = await import('../cmds/create_account.js');
      const { privateKey, wait, registerOnly, skipInitialization, publicDeploy, rpcUrl } = args;
      await createAccount(
        rpcUrl,
        privateKey,
        registerOnly,
        skipInitialization,
        publicDeploy,
        wait,
        FeeOpts.fromCli(args, log),
        debugLogger,
        log,
      );
    });

  const deployCommand = program
    .command('deploy')
    .description('Deploys a compiled Aztec.nr contract to Aztec.')
    .argument(
      '<artifact>',
      "A compiled Aztec.nr contract's artifact in JSON format or name of a contract artifact exported by @aztec/noir-contracts.js",
    )
    .option('--init <string>', 'The contract initializer function to call', 'constructor')
    .option('--no-init', 'Leave the contract uninitialized')
    .option('-a, --args <constructorArgs...>', 'Contract constructor arguments', [])
    .option(
      '-k, --public-key <string>',
      'Optional encryption public key for this address. Set this value only if this contract is expected to receive private notes, which will be encrypted using this public key.',
      parsePublicKey,
    )
    .option(
      '-s, --salt <hex string>',
      'Optional deployment salt as a hex string for generating the deployment address.',
      parseFieldFromHexString,
    )
    .option('--universal', 'Do not mix the sender address into the deployment.')
    .addOption(createPrivateKeyOption("The sender's private key.", true))
    .option('--json', 'Emit output as json')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction')
    .option('--no-class-registration', "Don't register this contract class")
    .option('--no-public-deployment', "Don't emit this contract's public bytecode");
  addOptions(deployCommand, FeeOpts.getOptions()).action(async (artifactPath, opts) => {
    const { deploy } = await import('../cmds/deploy.js');
    const {
      json,
      publicKey,
      args: rawArgs,
      salt,
      wait,
      privateKey,
      classRegistration,
      init,
      publicDeployment,
      universal,
      rpcUrl,
    } = opts;
    await deploy(
      artifactPath,
      json,
      rpcUrl,
      publicKey ? PublicKeys.fromString(publicKey) : undefined,
      rawArgs,
      salt,
      privateKey,
      typeof init === 'string' ? init : undefined,
      !publicDeployment,
      !classRegistration,
      typeof init === 'string' ? false : init,
      universal,
      wait,
      FeeOpts.fromCli(opts, log),
      debugLogger,
      log,
      logJson(log),
    );
  });

  const sendCommand = program
    .command('send')
    .description('Calls a function on an Aztec contract.')
    .argument('<functionName>', 'Name of function to execute')
    .option('-a, --args [functionArgs...]', 'Function arguments', [])
    .requiredOption('-c, --contract-artifact <fileLocation>', "A compiled Aztec.nr contract's ABI in JSON format")
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', parseAztecAddress)
    .addOption(createPrivateKeyOption("The sender's private key.", true))
    .option('--no-wait', 'Print transaction hash without waiting for it to be mined');
  addOptions(sendCommand, FeeOpts.getOptions()).action(async (functionName, options) => {
    const { send } = await import('../cmds/send.js');
    const { args, contractArtifact, contractAddress, privateKey, noWait, rpcUrl } = options;
    await send(
      functionName,
      args,
      contractArtifact,
      contractAddress,
      privateKey,
      rpcUrl,
      !noWait,
      FeeOpts.fromCli(options, log),
      debugLogger,
      log,
    );
  });
}
