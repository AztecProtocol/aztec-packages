#!/usr/bin/env node
import { Command } from 'commander';
import { createLogger } from '@aztec/foundation/log';
import { createDebugLogger } from '@aztec/foundation/log';
import {
  AztecAddress,
  Contract,
  ContractDeployer,
  Point,
  TxHash,
  createAccounts,
  createAztecRpcClient,
  pointToPublicKey,
} from '@aztec/aztec.js';

import { encodeArgs, parseStructString } from './cli_encoder.js';
import { deployAztecContracts, getContractAbi, prepTx } from './utils.js';
import { JsonStringify } from '@aztec/foundation/json-rpc';
import { StructType } from '@aztec/foundation/abi';
import { L2BlockL2Logs } from '@aztec/types';

const debugLogger = createDebugLogger('aztec:cli');
const log = createLogger();

const program = new Command();

program.name('azti').description('CLI for interacting with Aztec.').version('0.1.0');

/**
 * A placeholder for the Aztec-cli.
 */
async function main() {
  program
    .command('deploy-l1-contracts')
    .argument(
      '[rpcUrl]',
      'Url of the ethereum host. Chain identifiers localhost and testnet can be used',
      'http://localhost:8545',
    )
    .option('-a, --api-key <string>', 'Api key for the ethereum host', undefined)
    .option('-p, --private-key <string>', 'The private key to use for deployment')
    .option(
      '-m, --mnemonic <string>',
      'The mnemonic to use in deployment',
      'test test test test test test test test test test test junk',
    )
    .action(async (rpcUrl: string, options) => {
      await deployAztecContracts(rpcUrl, options.apiKey ?? '', options.privateKey, options.mnemonic, debugLogger);
    });

  program
    .command('deploy')
    .argument('<contractAbi>', "A compiled Noir contract's ABI in JSON format", undefined)
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .option('-k, --public-key <string>')
    .option('-a, --constructor-args [args...]', 'Contract constructor arguments', [])
    .action(async (contractFile: string, options: any) => {
      const contractAbi = getContractAbi(contractFile, log);
      const constructorAbi = contractAbi.functions.find(({ name }) => name === 'constructor');

      const publicKey = Point.fromString(options.publicKey);
      const client = createAztecRpcClient(options.rpcUrl);
      const deployer = new ContractDeployer(contractAbi, client);

      const tx = deployer
        .deploy(...encodeArgs(options.constructorArgs, constructorAbi!.parameters), pointToPublicKey(publicKey))
        .send();
      await tx.isMined();
      const receipt = await tx.getReceipt();
      log(`Contract deployed at ${receipt.contractAddress?.toString()}`);
    });

  program
    .command('check-deploy')
    .argument('<contractAddress>', 'An Aztec address to check if contract has been deployed to.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (_contractAddress, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const address = AztecAddress.fromString(_contractAddress);
      const isDeployed = await client.isContractDeployed(address);
      log(isDeployed.toString());
    });

  program
    .command('get-tx-receipt')
    .argument('<txHash>', 'A TX hash to get the receipt for.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (_txHash, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const txHash = TxHash.fromString(_txHash);
      const receipt = await client.getTxReceipt(txHash);
      if (!receipt) {
        log(`No receipt found for tx hash ${_txHash}`);
      } else {
        log(`TX Receipt: \n${JsonStringify(receipt, true)}`);
      }
    });

  program
    .command('get-contract-data')
    .argument('<contractAddress>', 'Aztec address of the contract.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .option('-b, --include-bytecode', "Include the contract's public function bytecode, if any.")
    .action(async (_contractAddress, options) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const address = AztecAddress.fromString(_contractAddress);
      const contractData = options.includeBytecode
        ? await client.getContractData(address)
        : await client.getContractInfo(address);
      if (!contractData) {
        log(`No contract data found at ${_contractAddress}`);
      } else {
        log(`Contract Data: \n${JsonStringify(contractData, true)}`);
      }
    });

  program
    .command('get-logs')
    .argument('<from>', 'Block num start for getting logs.')
    .argument('<take>', 'How many block logs to fetch.')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
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

  // NOTE: This implementation should change soon but keeping it here for quick account creation.
  program
    .command('create-account')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async options => {
      const client = createAztecRpcClient(options.rpcUrl);
      const res = await createAccounts(client);
      const [[address, pubKeyPoint]] = res;
      log(`Created account. \nAddress: ${address.toString()} \nPublic key: ${pubKeyPoint.toString()}`);
    });

  program
    .command('get-accounts')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (options: any) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const accounts = await client.getAccounts();
      if (!accounts.length) {
        log('No accounts found.');
      } else {
        log(`Accounts found: \n`);
        accounts.forEach(acc => log(`${acc}\n`));
      }
    });

  program
    .command('get-account-public-key')
    .argument('<address>', 'The Aztec address to get the public key for')
    .option('-u, --rpc-url <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
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
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format", undefined)
    .argument('<contractAddress>', 'Address of the contract')
    .argument('<functionName>', 'Name of Function to view')
    .argument('[from]', 'The caller of the transaction', undefined)
    .argument('[functionArgs...]', 'Function arguments', [])
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (contractFile, _contractAddress, functionName, _from, _functionArgs, options) => {
      const { contractAddress, functionArgs, from, contractAbi } = prepTx(
        contractFile,
        _contractAddress,
        functionName,
        _from,
        _functionArgs,
        log,
      );
      const client = createAztecRpcClient(options.rpcUrl);
      const contract = new Contract(contractAddress, contractAbi, client);
      const tx = contract.methods[functionName](...functionArgs).send({ from });
      await tx.isMined();
      log('TX has been mined');
      const receipt = await tx.getReceipt();
      log(`TX Hash: ${(await tx.getTxHash()).toString()}`);
      log(`Block Num: ${receipt.blockNumber}`);
      log(`Block Hash: ${receipt.blockHash?.toString('hex')}`);
      log(`TX Status: ${receipt.status}`);
    });

  program
    .command('view-tx')
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format", undefined)
    .argument('<contractAddress>', 'Address of the contract')
    .argument('<functionName>', 'Name of Function to view')
    .argument('[from]', 'The caller of the transaction', undefined)
    .argument('[functionArgs...]', 'Function arguments', [])
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (contractFile, _contractAddress, functionName, _from, _functionArgs, options) => {
      const { contractAddress, functionArgs, from } = prepTx(
        contractFile,
        _contractAddress,
        functionName,
        _from,
        _functionArgs,
        log,
      );
      const client = createAztecRpcClient(options.rpcUrl);
      const result = await client.viewTx(functionName, functionArgs, contractAddress, from);
      log('View TX returned result: ', JsonStringify(result, true));
    });

  // Helper for users to decode hex strings into structs if needed
  program
    .command('parse-parameter-struct')
    .argument('<encodedString>', 'The encoded hex string')
    .argument('<contractAbi>', "The compiled contract's ABI in JSON format")
    .argument('<parameterName>', 'The name of the struct parameter to decode into')
    .action(async (encodedString, contractFile, parameterName) => {
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
      log(`Struct Data: \n${JsonStringify(data, true)}`);
    });

  program
    .command('block-num')
    .option('-u, --rpcUrl <string>', 'URL of the Aztec RPC', 'http://localhost:8080')
    .action(async (options: any) => {
      const client = createAztecRpcClient(options.rpcUrl);
      const num = await client.getBlockNum();
      log(num);
    });

  await program.parseAsync(process.argv);
}

main().catch(err => {
  log(`Error thrown: ${err}`);
  process.exit(1);
});
