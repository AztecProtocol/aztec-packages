#!/usr/bin/env -S node --no-warnings
import {
  AztecAddress,
  Contract,
  ContractDeployer,
  Fr,
  Point,
  createAccounts,
  createAztecRpcClient,
  getAccountWallet,
} from '@aztec/aztec.js';
import { StructType } from '@aztec/foundation/abi';
import { randomBytes } from '@aztec/foundation/crypto';
import { JsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { createDebugLogger } from '@aztec/foundation/log';
import { SchnorrAccountContractAbi } from '@aztec/noir-contracts/examples';
import { ContractData, L2BlockL2Logs, TxHash } from '@aztec/types';

import { Command } from 'commander';
import { mnemonicToAccount } from 'viem/accounts';

import { encodeArgs, parseStructString } from './cli_encoder.js';
import { deployAztecContracts, getContractAbi, getTxSender, prepTx } from './utils.js';

const accountCreationSalt = Fr.ZERO;

const debugLogger = createDebugLogger('aztec:cli');
const log = createLogger();

const program = new Command();

program.name('azti').description('CLI for interacting with Aztec.').version('0.1.0');

const { ETHEREUM_HOST, AZTEC_RPC_HOST, PRIVATE_KEY, PUBLIC_KEY, API_KEY } = process.env;

/**
 * Main function for the Aztec CLI.
 */
async function main() {
  program
    .command('deploy-l1-contracts')
    .description('Deploys all necessary Ethereum contracts for Aztec.')
    .argument(
      '[rpcUrl]',
      'Url of the ethereum host. Chain identifiers localhost and testnet can be used',
      ETHEREUM_HOST || 'http://localhost:8545',
    )
    .option('-a, --api-key <string>', 'Api key for the ethereum host', API_KEY)
    .option('-p, --private-key <string>', 'The private key to use for deployment', PRIVATE_KEY)
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .action(async (rpcUrl: string, options) => {
      const { rollupAddress, registryAddress, inboxAddress, outboxAddress, contractDeploymentEmitterAddress } =
        await deployAztecContracts(rpcUrl, options.apiKey ?? '', options.privateKey, options.mnemonic, debugLogger);
      log('\n');
      log(`Rollup Address: ${rollupAddress.toString()}`);
      log(`Registry Address: ${registryAddress.toString()}`);
      log(`L1 -> L2 Inbox Address: ${inboxAddress.toString()}`);
      log(`L2 -> L1 Outbox address: ${outboxAddress.toString()}`);
      log(`Contract Deployment Emitter Address: ${contractDeploymentEmitterAddress.toString()}`);
      log('\n');
    });

  program
    .command('create-private-key')
    .description('Generates a 32-byte private key.')
    .option('-m, --mnemonic', 'A mnemonic string that can be used for the private key generation.')
    .action(options => {
      let privKey;
      if (options.mnemonic) {
        const acc = mnemonicToAccount(options.mnemonic);
        privKey = Buffer.from(acc.getHdKey().privateKey!).toString('hex');
      } else {
        privKey = randomBytes(32).toString('hex');
      }
      log(`\n${privKey}\n`);
    });

  program
    .command('create-account')
    .description('Creates an aztec account that can be used for transactions.')
    .option(
      '-k, --private-key <string>',
      'Private Key to use for the 1st account generation. Uses random by default.',
      PRIVATE_KEY,
    )
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async options => {
      const client = createAztecRpcClient(options.rpcUrl);
      const privateKey = options.privateKey && Buffer.from(options.privateKey.replace(/^0x/i, ''), 'hex');
      const wallet = await createAccounts(client, SchnorrAccountContractAbi, privateKey, accountCreationSalt, 1);
      const accounts = await wallet.getAccounts();
      const pubKeys = await Promise.all(accounts.map(acc => wallet.getAccountPublicKey(acc)));
      log(`\nCreated account(s).`);
      accounts.map((acc, i) => log(`\nAddress: ${acc.toString()}\nPublic Key: ${pubKeys[i].toString()}\n`));
    });

  program
    .command('deploy')
    .description('Deploys a compiled Noir contract to Aztec.')
    .argument('<contractAbi>', "A compiled Noir contract's ABI in JSON format", undefined)
    .argument('[constructorArgs...]', 'Contract constructor arguments', [])
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .option(
      '-k, --public-key <string>',
      'Public key of the deployer. If not provided, it will check the RPC for existing ones.',
      PUBLIC_KEY,
    )
    .action(async (contractFile: string, args: string[], options: any) => {
      const contractAbi = getContractAbi(contractFile, log);
      const constructorAbi = contractAbi.functions.find(({ name }) => name === 'constructor');

      const client = createAztecRpcClient(options.rpcUrl);
      let publicKey;
      if (options.publicKey) {
        publicKey = Point.fromString(options.publicKey);
      } else {
        const accounts = await client.getAccounts();
        if (!accounts) {
          throw new Error('No public key provided or found in Aztec RPC.');
        }
        publicKey = await client.getAccountPublicKey(accounts[0]);
      }

      log(`Using Public Key: ${publicKey.toString()}`);

      const deployer = new ContractDeployer(contractAbi, client);

      const tx = deployer.deploy(...encodeArgs(args, constructorAbi!.parameters), publicKey.toBigInts()).send();
      await tx.isMined();
      const receipt = await tx.getReceipt();
      log(`\nAztec Contract deployed at ${receipt.contractAddress?.toString()}\n`);
    });

  program
    .command('check-deploy')
    .description('Checks if a contract is deployed to the specified Aztec address.')
    .argument('<contractAddress>', 'An Aztec address to check if contract has been deployed to.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (_contractAddress, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const address = AztecAddress.fromString(_contractAddress);
      const isDeployed = await client.isContractDeployed(address);
      log(`\n${isDeployed.toString()}\n`);
    });

  program
    .command('get-tx-receipt')
    .description('Gets the receipt for the specified transaction hash.')
    .argument('<txHash>', 'A TX hash to get the receipt for.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (_txHash, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const txHash = TxHash.fromString(_txHash);
      const receipt = await client.getTxReceipt(txHash);
      if (!receipt) {
        log(`No receipt found for tx hash ${_txHash}`);
      } else {
        log(`\nTX Receipt: \n${JsonStringify(receipt, true)}\n`);
      }
    });

  program
    .command('get-contract-data')
    .description('Gets information about the Aztec contract deployed at the specified address.')
    .argument('<contractAddress>', 'Aztec address of the contract.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .option('-b, --include-bytecode', "Include the contract's public function bytecode, if any.")
    .action(async (_contractAddress, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const address = AztecAddress.fromString(_contractAddress);
      const contractDataOrInfo = options.includeBytecode
        ? await client.getContractData(address)
        : await client.getContractInfo(address);

      if (!contractDataOrInfo) {
        log(`No contract data found at ${_contractAddress}`);
        return;
      }
      let contractData: ContractData;

      if ('contractData' in contractDataOrInfo) {
        contractData = contractDataOrInfo.contractData;
      } else {
        contractData = contractDataOrInfo;
      }
      log(`\nContract Data: \nAddress: ${contractData.contractAddress.toString()}`);
      log(`Portal: ${contractData.portalContractAddress.toString()}`);
      if ('bytecode' in contractDataOrInfo) {
        log(`Bytecode: ${contractDataOrInfo.bytecode}`);
      }
      log('\n');
    });

  program
    .command('get-logs')
    .description('Gets all the unencrypted logs from L2 blocks in the range specified.')
    .argument('<from>', 'Block num start for getting logs.')
    .argument('<take>', 'How many block logs to fetch.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (_from, _take, options) => {
      let from: number;
      let take: number;
      try {
        from = parseInt(_from);
        take = parseInt(_take);
      } catch {
        log(`Invalid integer value(s) passed: ${_from}, ${_take}`);
        return;
      }
      const client = createAztecRpcClient(options.rpcUrl);
      const logs = await client.getUnencryptedLogs(from, take);
      if (!logs.length) {
        log(`No logs found in blocks ${from} to ${from + take}`);
      } else {
        log('Logs found: \n');
        L2BlockL2Logs.unrollLogs(logs).forEach(fnLog => log(`${fnLog.toString('ascii')}\n`));
      }
    });

  program
    .command('get-accounts')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (options: any) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const accounts = await client.getAccounts();
      if (!accounts.length) {
        log('No accounts found.');
      } else {
        log(`Accounts found: \n`);
        accounts.forEach(async acc => log(`Address: ${acc}\nPublic Key: ${await client.getAccountPublicKey(acc)}\n`));
      }
    });

  program
    .command('get-account-public-key')
    .description("Gets an account's public key, given its Aztec address.")
    .argument('<address>', 'The Aztec address to get the public key for')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (_address, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const address = AztecAddress.fromString(_address);
      const pk = await client.getAccountPublicKey(address);
      if (!pk) {
        log(`Unkown account ${_address}`);
      } else {
        log(`Public Key: \n ${pk.toString()}`);
      }
    });

  program
    .command('call-fn')
    .description('Calls a function on an Aztec contract.')
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format", undefined)
    .argument('<contractAddress>', 'Address of the contract')
    .argument('<functionName>', 'Name of Function to view')
    .argument('[functionArgs...]', 'Function arguments', [])
    .option('-k, --private-key <string>', "The sender's private key.", PRIVATE_KEY)
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')

    .action(async (contractFile, _contractAddress, functionName, _functionArgs, options) => {
      const { contractAddress, functionArgs, contractAbi } = prepTx(
        contractFile,
        _contractAddress,
        functionName,
        _functionArgs,
        log,
      );

      const client = createAztecRpcClient(options.rpcUrl);
      const wallet = await getAccountWallet(
        client,
        SchnorrAccountContractAbi,
        Buffer.from(options.privateKey, 'hex'),
        accountCreationSalt,
      );
      const contract = new Contract(contractAddress, contractAbi, wallet);
      const origin = (await wallet.getAccounts()).find(addr => addr.equals(wallet.getAddress()));
      const tx = contract.methods[functionName](...functionArgs).send({
        origin,
      });
      await tx.isMined();
      log('\nTX has been mined');
      const receipt = await tx.getReceipt();
      log(`TX Hash: ${(await tx.getTxHash()).toString()}`);
      log(`Block Num: ${receipt.blockNumber}`);
      log(`Block Hash: ${receipt.blockHash?.toString('hex')}`);
      log(`TX Status: ${receipt.status}\n`);
    });

  program
    .command('view-fn')
    .description(
      'Simulates the execution of a view (read-only) function on a deployed contract, without modifying state.',
    )
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format", undefined)
    .argument('<contractAddress>', 'Address of the contract')
    .argument('<functionName>', 'Name of Function to view')
    .argument('[functionArgs...]', 'Function arguments', [])
    .option('-f, --from <string>', 'Public key of the TX viewer. If empty, will try to find account in RPC.')
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (contractFile, _contractAddress, functionName, _functionArgs, options) => {
      const { contractAddress, functionArgs } = prepTx(
        contractFile,
        _contractAddress,
        functionName,
        _functionArgs,
        log,
      );
      const client = createAztecRpcClient(options.rpcUrl);
      const from = await getTxSender(client, options.from);
      const result = await client.viewTx(functionName, functionArgs, contractAddress, from);
      log('\nView TX result: ', JsonStringify(result, true), '\n');
    });

  // Helper for users to decode hex strings into structs if needed
  program
    .command('parse-parameter-struct')
    .description("Helper for parsing an encoded string into a contract's parameter struct.")
    .argument('<encodedString>', 'The encoded hex string')
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format")
    .argument('<parameterName>', 'The name of the struct parameter to decode into')
    .action((encodedString, contractFile, parameterName) => {
      const contractAbi = getContractAbi(contractFile, log);
      const parameterAbitype = contractAbi.functions
        .map(({ parameters }) => parameters)
        .flat()
        .find(({ name, type }) => name === parameterName && type.kind === 'struct');
      if (!parameterAbitype) {
        log(`No struct parameter found with name ${parameterName}`);
        return;
      }
      const data = parseStructString(encodedString, parameterAbitype.type as StructType);
      log(`\nStruct Data: \n${JsonStringify(data, true)}\n`);
    });

  program
    .command('block-num')
    .description('Gets the current Aztec L2 number.')
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', AZTEC_RPC_HOST || 'http://localhost:8080')
    .action(async (options: any) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const num = await client.getBlockNum();
      log(`${num}\n`);
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  log(`Error thrown: ${err}`);
  process.exit(1);
});
