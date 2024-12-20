import { getIdentities } from '@aztec/accounts/utils';
import { createCompatibleClient } from '@aztec/aztec.js/rpc';
import { TxHash } from '@aztec/aztec.js/tx_hash';
import { GasFees } from '@aztec/circuits.js';
import { PublicKeys } from '@aztec/circuits.js/types';
import {
  ETHEREUM_HOST,
  PRIVATE_KEY,
  addOptions,
  createSecretKeyOption,
  l1ChainIdOption,
  logJson,
  parseBigint,
  parseFieldFromHexString,
  parsePublicKey,
  pxeOption,
} from '@aztec/cli/utils';
import { type LogFn, type Logger } from '@aztec/foundation/log';

import { type Command, Option } from 'commander';
import inquirer from 'inquirer';

import { type WalletDB } from '../storage/wallet_db.js';
import { type AccountType, addScopeToWallet, createOrRetrieveAccount, getWalletWithScopes } from '../utils/accounts.js';
import { FeeOpts } from '../utils/options/fees.js';
import {
  ARTIFACT_DESCRIPTION,
  aliasedAddressParser,
  aliasedAuthWitParser,
  aliasedSecretKeyParser,
  aliasedTxHashParser,
  artifactPathFromPromiseOrAlias,
  artifactPathParser,
  createAccountOption,
  createAliasOption,
  createArgsOption,
  createArtifactOption,
  createContractAddressOption,
  createProfileOption,
  createTypeOption,
  integerArgParser,
  parseGasFees,
  parsePaymentMethod,
} from '../utils/options/index.js';
import { type PXEWrapper } from '../utils/pxe_wrapper.js';

export function injectCommands(
  program: Command,
  log: LogFn,
  debugLogger: Logger,
  db?: WalletDB,
  pxeWrapper?: PXEWrapper,
) {
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
    .addOption(
      createSecretKeyOption('Secret key for account. Uses random by default.', false, sk =>
        aliasedSecretKeyParser(sk, db),
      ).conflicts('public-key'),
    )
    .addOption(createAliasOption('Alias for the account. Used for easy reference in subsequent commands.', !db))
    .addOption(createTypeOption(true))
    .option(
      '--register-only',
      'Just register the account on the PXE. Do not deploy or initialize the account contract.',
    )
    .option('--json', 'Emit output as json')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction');

  addOptions(createAccountCommand, FeeOpts.getOptions()).action(async (_options, command) => {
    const { createAccount } = await import('./create_account.js');
    const options = command.optsWithGlobals();
    const { type, secretKey, wait, registerOnly, skipInitialization, publicDeploy, rpcUrl, alias, json } = options;
    let { publicKey } = options;
    if ((type as AccountType) === 'ecdsasecp256r1ssh' && !publicKey) {
      const identities = await getIdentities();
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'identity',
          message: 'What public key to use?',
          choices: identities.map(key => `${key.type} ${key.publicKey} ${key.comment}`),
          // Any required until https://github.com/SBoudrias/Inquirer.js/issues/1495 is fixed
        } as any,
      ]);
      publicKey = answers.identity.split(' ')[1];
    }
    const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
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
      await FeeOpts.fromCli(options, client, log, db),
      json,
      debugLogger,
      log,
    );
    if (db) {
      const { address, alias, secretKey, salt } = accountCreationResult;
      await db.storeAccount(address, { type, secretKey, salt, alias, publicKey }, log);
    }
  });

  const deployAccountCommand = program
    .command('deploy-account')
    .description('Deploys an already registered aztec account that can be used for sending transactions.')
    .addOption(createAccountOption('Alias or address of the account to deploy', !db, db))
    .addOption(pxeOption)
    .option('--json', 'Emit output as json')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction');

  addOptions(deployAccountCommand, FeeOpts.getOptions()).action(async (_options, command) => {
    const { deployAccount } = await import('./deploy_account.js');
    const options = command.optsWithGlobals();
    const { rpcUrl, wait, from: parsedFromAddress, json } = options;

    const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
    const account = await createOrRetrieveAccount(client, parsedFromAddress, db);

    await deployAccount(account, wait, await FeeOpts.fromCli(options, client, log, db), json, debugLogger, log);
  });

  const deployCommand = program
    .command('deploy')
    .description('Deploys a compiled Aztec.nr contract to Aztec.')
    .argument('[artifact]', ARTIFACT_DESCRIPTION, artifactPathParser)
    .option('--init <string>', 'The contract initializer function to call', 'constructor')
    .option('--no-init', 'Leave the contract uninitialized')
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
    .addOption(createArgsOption(true, db))
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to deploy from', !db, db))
    .addOption(createAliasOption('Alias for the contract. Used for easy reference subsequent commands.', !db))
    .option('--json', 'Emit output as json')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Skip waiting for the contract to be deployed. Print the hash of deployment transaction')
    .option('--no-class-registration', "Don't register this contract class")
    .option('--no-public-deployment', "Don't emit this contract's public bytecode");

  addOptions(deployCommand, FeeOpts.getOptions()).action(async (artifactPathPromise, _options, command) => {
    const { deploy } = await import('./deploy.js');
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
      from: parsedFromAddress,
      alias,
    } = options;
    const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
    const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
    const wallet = await getWalletWithScopes(account, db);
    const artifactPath = await artifactPathPromise;

    debugLogger.info(`Using wallet with address ${wallet.getCompleteAddress().address.toString()}`);

    const address = await deploy(
      client,
      wallet,
      artifactPath,
      json,
      publicKey ? PublicKeys.fromString(publicKey) : undefined,
      args,
      salt,
      typeof init === 'string' ? init : undefined,
      !publicDeployment,
      !classRegistration,
      typeof init === 'string' ? false : init,
      universal,
      wait,
      await FeeOpts.fromCli(options, client, log, db),
      debugLogger,
      log,
      logJson(log),
    );
    if (db && address) {
      await db.storeContract(address, artifactPath, log, alias);
    }
  });

  const sendCommand = program
    .command('send')
    .description('Calls a function on an Aztec contract.')
    .argument('<functionName>', 'Name of function to execute')
    .addOption(pxeOption)
    .addOption(createArgsOption(false, db))
    .addOption(createArtifactOption(db))
    .addOption(createContractAddressOption(db))
    .addOption(
      createAliasOption('Alias for the transaction hash. Used for easy reference in subsequent commands.', !db),
    )
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to send the transaction from', !db, db))
    .option('--no-wait', 'Print transaction hash without waiting for it to be mined')
    .option('--no-cancel', 'Do not allow the transaction to be cancelled. This makes for cheaper transactions.');

  addOptions(sendCommand, FeeOpts.getOptions()).action(async (functionName, _options, command) => {
    const { send } = await import('./send.js');
    const options = command.optsWithGlobals();
    const {
      args,
      contractArtifact: artifactPathPromise,
      contractAddress,
      from: parsedFromAddress,
      wait,
      rpcUrl,
      secretKey,
      alias,
      cancel,
    } = options;
    const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
    const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
    const wallet = await getWalletWithScopes(account, db);
    const artifactPath = await artifactPathFromPromiseOrAlias(artifactPathPromise, contractAddress, db);

    debugLogger.info(`Using wallet with address ${wallet.getCompleteAddress().address.toString()}`);

    const sentTx = await send(
      wallet,
      functionName,
      args,
      artifactPath,
      contractAddress,
      wait,
      cancel,
      await FeeOpts.fromCli(options, client, log, db),
      log,
    );
    if (db && sentTx) {
      const txAlias = alias ? alias : `${functionName}-${sentTx.nonce.toString().slice(-4)}`;
      await db.storeTx(sentTx, log, txAlias);
    }
  });

  program
    .command('simulate')
    .description('Simulates the execution of a function on an Aztec contract.')
    .argument('<functionName>', 'Name of function to simulate')
    .addOption(pxeOption)
    .addOption(createArgsOption(false, db))
    .addOption(createContractAddressOption(db))
    .addOption(createArtifactOption(db))
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(createProfileOption())
    .action(async (functionName, _options, command) => {
      const { simulate } = await import('./simulate.js');
      const options = command.optsWithGlobals();
      const {
        args,
        contractArtifact: artifactPathPromise,
        contractAddress,
        from: parsedFromAddress,
        rpcUrl,
        secretKey,
        profile,
      } = options;

      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);
      const artifactPath = await artifactPathFromPromiseOrAlias(artifactPathPromise, contractAddress, db);
      await simulate(wallet, functionName, args, artifactPath, contractAddress, profile, log);
    });

  program
    .command('bridge-fee-juice')
    .description('Mints L1 Fee Juice and pushes them to L2.')
    .argument('<amount>', 'The amount of Fee Juice to mint and bridge.', parseBigint)
    .argument('<recipient>', 'Aztec address of the recipient.', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .requiredOption(
      '--l1-rpc-url <string>',
      'Url of the ethereum host. Chain identifiers localhost and testnet can be used',
      ETHEREUM_HOST,
    )
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use for deriving the Ethereum address that will mint and bridge',
      'test test test test test test test test test test test junk',
    )
    .option('--mint', 'Mint the tokens on L1', false)
    .option('--l1-private-key <string>', 'The private key to the eth account bridging', PRIVATE_KEY)
    .addOption(pxeOption)
    .addOption(l1ChainIdOption)
    .option('--json', 'Output the claim in JSON format')
    // `options.wait` is default true. Passing `--no-wait` will set it to false.
    // https://github.com/tj/commander.js#other-option-types-negatable-boolean-and-booleanvalue
    .option('--no-wait', 'Wait for the brigded funds to be available in L2, polling every 60 seconds')
    .addOption(
      new Option('--interval <number>', 'The polling interval in seconds for the bridged funds')
        .default('60')
        .conflicts('wait'),
    )
    .action(async (amount, recipient, options) => {
      const { bridgeL1FeeJuice } = await import('./bridge_fee_juice.js');
      const { rpcUrl, l1RpcUrl, l1ChainId, l1PrivateKey, mnemonic, mint, json, wait, interval: intervalS } = options;
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));

      const [secret, messageLeafIndex] = await bridgeL1FeeJuice(
        amount,
        recipient,
        client,
        l1RpcUrl,
        l1ChainId,
        l1PrivateKey,
        mnemonic,
        mint,
        json,
        wait,
        intervalS * 1000,
        log,
        debugLogger,
      );
      if (db) {
        await db.pushBridgedFeeJuice(recipient, secret, amount, messageLeafIndex, log);
      }
    });

  program
    .command('add-note')
    .description('Adds a note to the database in the PXE.')
    .argument('[name]', 'The Note name')
    .argument(
      '[storageFieldName]',
      'The name of the variable in the storage field that contains the note. WARNING: Maps are not supported',
    )
    .requiredOption('-a, --address <string>', 'The Aztec address of the note owner.', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)))
    .requiredOption('-t, --transaction-hash <string>', 'The hash of the tx containing the note.', txHash =>
      aliasedTxHashParser(txHash, db),
    )
    .addOption(createContractAddressOption(db))
    .addOption(createArtifactOption(db))
    .addOption(
      new Option('-b, --body [noteFields...]', 'The members of a Note')
        .argParser((arg, prev: string[]) => {
          const next = db?.tryRetrieveAlias(arg) || arg;
          prev.push(next);
          return prev;
        })
        .default([]),
    )
    .addOption(pxeOption)
    .action(async (noteName, storageFieldName, _options, command) => {
      const { addNote } = await import('./add_note.js');
      const options = command.optsWithGlobals();
      const {
        contractArtifact: artifactPathPromise,
        contractAddress,
        address,
        secretKey,
        rpcUrl,
        body,
        transactionHash,
      } = options;
      const artifactPath = await artifactPathFromPromiseOrAlias(artifactPathPromise, contractAddress, db);
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, address, db, undefined, secretKey);
      const wallet = await getWalletWithScopes(account, db);

      await addNote(
        wallet,
        address,
        contractAddress,
        noteName,
        storageFieldName,
        artifactPath,
        transactionHash,
        body,
        log,
      );
    });

  program
    .command('create-authwit')
    .description(
      'Creates an authorization witness that can be privately sent to a caller so they can perform an action on behalf of the provided account',
    )
    .argument('<functionName>', 'Name of function to authorize')
    .argument('<caller>', 'Account to be authorized to perform the action', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(pxeOption)
    .addOption(createArgsOption(false, db))
    .addOption(createContractAddressOption(db))
    .addOption(createArtifactOption(db))
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(
      createAliasOption('Alias for the authorization witness. Used for easy reference in subsequent commands.', !db),
    )
    .action(async (functionName, caller, _options, command) => {
      const { createAuthwit } = await import('./create_authwit.js');
      const options = command.optsWithGlobals();
      const {
        args,
        contractArtifact: artifactPathPromise,
        contractAddress,
        from: parsedFromAddress,
        rpcUrl,
        secretKey,
        alias,
      } = options;

      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);
      const artifactPath = await artifactPathFromPromiseOrAlias(artifactPathPromise, contractAddress, db);
      const witness = await createAuthwit(wallet, functionName, caller, args, artifactPath, contractAddress, log);

      if (db) {
        await db.storeAuthwitness(witness, log, alias);
      }
    });

  program
    .command('authorize-action')
    .description(
      'Authorizes a public call on the caller, so they can perform an action on behalf of the provided account',
    )
    .argument('<functionName>', 'Name of function to authorize')
    .argument('<caller>', 'Account to be authorized to perform the action', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(pxeOption)
    .addOption(createArgsOption(false, db))
    .addOption(createContractAddressOption(db))
    .addOption(createArtifactOption(db))
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .action(async (functionName, caller, _options, command) => {
      const { authorizeAction } = await import('./authorize_action.js');
      const options = command.optsWithGlobals();
      const {
        args,
        contractArtifact: artifactPathPromise,
        contractAddress,
        from: parsedFromAddress,
        rpcUrl,
        secretKey,
      } = options;

      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);
      const artifactPath = await artifactPathFromPromiseOrAlias(artifactPathPromise, contractAddress, db);
      await authorizeAction(wallet, functionName, caller, args, artifactPath, contractAddress, log);
    });

  program
    .command('add-authwit')
    .description(
      'Adds an authorization witness to the provided account, granting PXE access to the notes of the authorizer so that it can be verified',
    )
    .argument('<authwit>', 'Authorization witness to add to the account', witness => aliasedAuthWitParser(witness, db))
    .argument('<authorizer>', 'Account that provides the authorization to perform the action', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(pxeOption)
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(
      createAliasOption('Alias for the authorization witness. Used for easy reference in subsequent commands.', !db),
    )
    .action(async (authwit, authorizer, _options, command) => {
      const { addAuthwit } = await import('./add_authwit.js');
      const options = command.optsWithGlobals();
      const { from: parsedFromAddress, rpcUrl, secretKey } = options;

      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);
      await addAuthwit(wallet, authwit, authorizer, log);
      await addScopeToWallet(wallet, authorizer, db);
    });

  program
    .command('get-tx')
    .description('Gets the status of the recent txs, or a detailed view if a specific transaction hash is provided')
    .argument('[txHash]', 'A transaction hash to get the receipt for.', txHash => aliasedTxHashParser(txHash, db))
    .addOption(pxeOption)
    .option('-p, --page <number>', 'The page number to display', value => integerArgParser(value, '--page', 1), 1)
    .option(
      '-s, --page-size <number>',
      'The number of transactions to display per page',
      value => integerArgParser(value, '--page-size', 1),
      10,
    )
    .action(async (txHash, options) => {
      const { checkTx } = await import('./check_tx.js');
      const { rpcUrl, pageSize } = options;
      let { page } = options;
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));

      if (txHash) {
        await checkTx(client, txHash, false, log);
      } else if (db) {
        const aliases = db.listAliases('transactions');
        const totalPages = Math.ceil(aliases.length / pageSize);
        page = Math.min(page - 1, totalPages - 1);
        const dataRows = await Promise.all(
          aliases.slice(page * pageSize, pageSize * (1 + page)).map(async ({ key, value }) => ({
            alias: key,
            txHash: value,
            cancellable: db.retrieveTxData(TxHash.fromString(value)).cancellable,
            status: await checkTx(client, TxHash.fromString(value), true, log),
          })),
        );
        log(`Recent transactions:`);
        log('');
        log(`${'Alias'.padEnd(32, ' ')} | ${'TxHash'.padEnd(64, ' ')} | ${'Cancellable'.padEnd(12, ' ')} | Status`);
        log(''.padEnd(32 + 64 + 12 + 20, '-'));
        for (const { alias, txHash, status, cancellable } of dataRows) {
          log(`${alias.padEnd(32, ' ')} | ${txHash} | ${cancellable.toString()?.padEnd(12, ' ')} | ${status}`);
          log(''.padEnd(32 + 64 + 12 + 20, '-'));
        }
        log(`Displaying ${Math.min(pageSize, aliases.length)} rows, page ${page + 1}/${totalPages}`);
      } else {
        log('Recent transactions are not available, please provide a specific transaction hash');
      }
    });

  program
    .command('cancel-tx')
    .description('Cancels a pending tx by reusing its nonce with a higher fee and an empty payload')
    .argument('<txHash>', 'A transaction hash to cancel.', txHash => aliasedTxHashParser(txHash, db))
    .addOption(pxeOption)
    .addOption(
      createSecretKeyOption("The sender's secret key", !db, sk => aliasedSecretKeyParser(sk, db)).conflicts('account'),
    )
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(FeeOpts.paymentMethodOption().default('method=none'))
    .option(
      '-i --increased-fees <da=1,l2=1>',
      'The amounts by which the fees are increased',
      value => parseGasFees(value),
      new GasFees(1, 1),
    )
    .option('--max-fees-per-gas <da=100,l2=100>', 'Maximum fees per gas unit for DA and L2 computation.', value =>
      parseGasFees(value),
    )
    .action(async (txHash, options) => {
      const { cancelTx } = await import('./cancel_tx.js');
      const { from: parsedFromAddress, rpcUrl, secretKey, payment, increasedFees, maxFeesPerGas } = options;
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);

      const txData = db?.retrieveTxData(txHash);
      if (!txData) {
        throw new Error('Transaction data not found in the database, cannot reuse nonce');
      }

      const paymentMethod = await parsePaymentMethod(payment, log, db)(wallet);

      await cancelTx(wallet, txData, paymentMethod, increasedFees, maxFeesPerGas, log);
    });

  program
    .command('register-sender')
    .description(
      "Registers a sender's address in the wallet, so the note synching process will look for notes sent by them",
    )
    .argument('[address]', 'The address of the sender to register', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(pxeOption)
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(createAliasOption('Alias for the sender. Used for easy reference in subsequent commands.', !db))
    .action(async (address, options) => {
      const { registerSender } = await import('./register_sender.js');
      const { from: parsedFromAddress, rpcUrl, secretKey, alias } = options;
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);

      await registerSender(wallet, address, log);

      if (db && alias) {
        await db.storeSender(address, alias, log);
      }
    });

  program
    .command('register-contract')
    .description("Registers a contract in this wallet's PXE")
    .argument('[address]', 'The address of the contract to register', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .argument('[artifact]', ARTIFACT_DESCRIPTION, artifactPathParser)
    .option('--init <string>', 'The contract initializer function to call', 'constructor')
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
    .option('--deployer <string>', 'The address of the account that deployed the contract', address =>
      aliasedAddressParser('accounts', address, db),
    )
    .addOption(createArgsOption(true, db))
    .addOption(pxeOption)
    .addOption(createAccountOption('Alias or address of the account to simulate from', !db, db))
    .addOption(createAliasOption('Alias for the contact. Used for easy reference in subsequent commands.', !db))
    .action(async (address, artifactPathPromise, _options, command) => {
      const { registerContract } = await import('./register_contract.js');
      const {
        from: parsedFromAddress,
        rpcUrl,
        secretKey,
        alias,
        init,
        publicKey,
        salt,
        deployer,
        args,
      } = command.optsWithGlobals();
      const client = pxeWrapper?.getPXE() ?? (await createCompatibleClient(rpcUrl, debugLogger));
      const account = await createOrRetrieveAccount(client, parsedFromAddress, db, secretKey);
      const wallet = await getWalletWithScopes(account, db);

      const artifactPath = await artifactPathPromise;

      const instance = await registerContract(
        wallet,
        address,
        artifactPath,
        init,
        publicKey ? PublicKeys.fromString(publicKey) : undefined,
        args,
        salt,
        deployer,
        log,
      );

      if (db && alias) {
        await db.storeContract(instance.address, artifactPath, log, alias);
      }
    });

  return program;
}
