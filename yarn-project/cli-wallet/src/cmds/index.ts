import { createCompatibleClient } from '@aztec/aztec.js';
import { PublicKeys } from '@aztec/circuits.js';
import {
  addOptions,
  createSecretKeyOption,
  logJson,
  parseAztecAddress,
  parseFieldFromHexString,
  parsePublicKey,
  pxeOption,
} from '@aztec/cli/utils';
import { type DebugLogger, type LogFn } from '@aztec/foundation/log';

import { type Command, Option } from 'commander';
import { parse } from 'path';

import { type WalletDB } from '../storage/wallet_db.js';
import { AccountTypes, createAndStoreAccount, createOrRetrieveWallet } from '../utils/accounts.js';
import { FeeOpts } from '../utils/fees.js';

function createAliasOption(allowAddress: boolean, description: string, hide: boolean) {
  return new Option(`-a, --alias${allowAddress ? '-or-address' : ''} <string>`, description).hideHelp(hide);
}

function createTypeOption() {
  return new Option('-t, --type <string>', 'Type of account to create')
    .choices(AccountTypes)
    .conflicts('alias-or-address');
}

export function injectCommands(program: Command, log: LogFn, debugLogger: DebugLogger, db?: WalletDB) {
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
    .option(
      '-p, --public-key <string>',
      'Public key that identifies a private signing key stored outside of the wallet. Used for ECDSA SSH accounts over the secp256r1 curve.',
    )
    .addOption(pxeOption)
    .addOption(createSecretKeyOption('Private key for account. Uses random by default.', false).conflicts('public-key'))
    .addOption(createAliasOption(false, 'Alias for the account. Used for easy reference in the PXE.', !db))
    .addOption(createTypeOption().makeOptionMandatory(true));

  addOptions(createAccountCommand, FeeOpts.getOptions())
    .option(
      '--register-only',
      'Just register the account on the PXE. Do not deploy or initialize the account contract.',
    )
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction')
    .action(async (_options, command) => {
      const { createAccount } = await import('../cmds/create_account.js');
      const options = command.optsWithGlobals();
      const { type, secretKey, publicKey, wait, registerOnly, skipInitialization, publicDeploy, rpcUrl, alias } =
        options;
      const client = await createCompatibleClient(rpcUrl, debugLogger);
      const accountCreationResult = await createAccount(
        client,
        type,
        secretKey,
        publicKey,
        alias,
        registerOnly,
        skipInitialization,
        publicDeploy,
        wait,
        FeeOpts.fromCli(options, log),
        debugLogger,
        log,
      );
      if (db) {
        const { alias, secretKey, salt } = accountCreationResult;
        await createAndStoreAccount(client, type, secretKey, publicKey, salt, alias, db);
        log(`Account stored in database with alias ${alias}`);
      }
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
    .option('--args <constructorArgs...>', 'Contract constructor arguments', [])
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
    .addOption(pxeOption)
    .addOption(createSecretKeyOption("The sender's private key", !db).conflicts('alias'))
    .addOption(createAliasOption(true, 'Alias or address of the account to deploy from', !db))
    .addOption(createTypeOption())
    .option('--json', 'Emit output as json')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction')
    .option('--no-class-registration', "Don't register this contract class")
    .option('--no-public-deployment', "Don't emit this contract's public bytecode");

  addOptions(deployCommand, FeeOpts.getOptions()).action(async (artifactPath, _options, command) => {
    const { deploy } = await import('../cmds/deploy.js');
    const options = command.optsWithGlobals();
    const {
      json,
      publicKey,
      args,
      salt,
      wait,
      secretKey,
      classRegistration,
      init,
      publicDeployment,
      universal,
      rpcUrl,
      aliasOrAddress,
      type,
    } = options;
    const client = await createCompatibleClient(rpcUrl, debugLogger);
    const wallet = await createOrRetrieveWallet(client, aliasOrAddress, type, secretKey, publicKey, db);

    const address = await deploy(
      client,
      wallet,
      artifactPath,
      json,
      publicKey ? PublicKeys.fromString(publicKey) : undefined,
      args.map((arg: string) => (db ? db?.retrieveAlias(arg) : arg)),
      salt,
      typeof init === 'string' ? init : undefined,
      !publicDeployment,
      !classRegistration,
      typeof init === 'string' ? false : init,
      universal,
      wait,
      FeeOpts.fromCli(options, log),
      debugLogger,
      log,
      logJson(log),
    );
    if (db && address) {
      await db.storeContract(address);
      log('Contract stored in database with alias last');
    }
  });

  const sendCommand = program
    .command('send')
    .description('Calls a function on an Aztec contract.')
    .argument('<functionName>', 'Name of function to execute')
    .addOption(pxeOption)
    .option(
      '--args [functionArgs...]',
      'Function arguments',
      (arg, prev: string[]) => {
        const next = db ? db.retrieveAlias(arg) : arg;
        prev.push(next);
        return prev;
      },
      [],
    )
    .requiredOption('-c, --contract-artifact <fileLocation>', "A compiled Aztec.nr contract's ABI in JSON format")
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', address => {
      const rawAddress = db ? db.retrieveAlias(address) : address;
      return parseAztecAddress(rawAddress);
    })
    .addOption(createSecretKeyOption("The sender's private key.", !db).conflicts('alias'))
    .addOption(createAliasOption(true, 'Alias or address of the account to deploy from', !db))
    .addOption(createTypeOption())
    .option('--no-wait', 'Print transaction hash without waiting for it to be mined');

  addOptions(sendCommand, FeeOpts.getOptions()).action(async (functionName, _options, command) => {
    const { send } = await import('../cmds/send.js');
    const options = command.optsWithGlobals();
    const { args, contractArtifact, contractAddress, aliasOrAddress, noWait, rpcUrl, type, secretKey, publicKey } =
      options;
    const client = await createCompatibleClient(rpcUrl, debugLogger);
    const wallet = await createOrRetrieveWallet(client, aliasOrAddress, type, secretKey, publicKey, db);
    await send(
      wallet,
      functionName,
      args,
      contractArtifact,
      contractAddress,
      !noWait,
      FeeOpts.fromCli(options, log),
      log,
    );
  });

  program
    .command('simulate')
    .description('Simulates the execution of a function on an Aztec contract.')
    .argument('<functionName>', 'Name of function to simulate')
    .addOption(pxeOption)
    .option(
      '--args [functionArgs...]',
      'Function arguments',
      (arg, prev: string[]) => {
        const next = db ? db.retrieveAlias(arg) : arg;
        prev.push(next);
        return prev;
      },
      [],
    )
    .requiredOption('-c, --contract-artifact <fileLocation>', "A compiled Aztec.nr contract's ABI in JSON format")
    .requiredOption('-ca, --contract-address <address>', 'Aztec address of the contract.', address => {
      const rawAddress = db ? db.retrieveAlias(address) : address;
      return parseAztecAddress(rawAddress);
    })
    .addOption(createSecretKeyOption("The sender's private key.", !db).conflicts('alias'))
    .addOption(createAliasOption(true, 'Alias or address of the account to deploy from', !db))
    .addOption(createTypeOption())
    .action(async (functionName, _options, command) => {
      const { simulate } = await import('../cmds/simulate.js');
      const options = command.optsWithGlobals();
      const { args, contractArtifact, contractAddress, aliasOrAddress, rpcUrl, type, secretKey, publicKey } = options;
      const client = await createCompatibleClient(rpcUrl, debugLogger);
      const wallet = await createOrRetrieveWallet(client, aliasOrAddress, type, secretKey, publicKey, db);
      await simulate(wallet, functionName, args, contractArtifact, contractAddress, log);
    });

  return program;
}
