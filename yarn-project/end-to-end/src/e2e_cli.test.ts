import { AztecNodeService } from '@aztec/aztec-node';
import { AztecAddress, AztecRPCServer } from '@aztec/aztec-rpc';
import { startHttpRpcServer } from '@aztec/aztec-sandbox/http';
import { createDebugLogger } from '@aztec/aztec.js';
import { getProgram } from '@aztec/cli';
import { DebugLogger } from '@aztec/foundation/log';
import { AztecRPC, CompleteAddress, PrivateKey } from '@aztec/types';

import stringArgv from 'string-argv';
import { format } from 'util';

import { setup } from './fixtures/utils.js';

const HTTP_PORT = 9009;
const INITIAL_BALANCE = 33000;
const TRANSFER_BALANCE = 3000;

// Spins up a new http server wrapping the set up rpc server, and tests cli commands against it
describe('cli', () => {
  let cli: ReturnType<typeof getProgram>;
  let http: ReturnType<typeof startHttpRpcServer>;
  let debug: DebugLogger;
  let aztecNode: AztecNodeService | undefined;
  let aztecRpcServer: AztecRPC;
  let existingAccounts: CompleteAddress[];
  let ownerAddress: CompleteAddress;
  let receiverAddress: CompleteAddress;
  let privateKey: PrivateKey;
  let contractAddress: AztecAddress;
  let log: (...args: any[]) => void;

  // All logs emitted by the cli will be collected here, and reset between tests
  const logs: string[] = [];

  beforeAll(async () => {
    debug = createDebugLogger('aztec:e2e_cli');
    const context = await setup(2);
    debug(`Environment set up`);
    const { deployL1ContractsValues } = context;
    ({ aztecNode, aztecRpcServer } = context);
    http = startHttpRpcServer(aztecRpcServer, deployL1ContractsValues, HTTP_PORT);
    debug(`HTTP RPC server started in port ${HTTP_PORT}`);
    log = (...args: any[]) => {
      logs.push(format(...args));
      debug(...args);
    };
  });

  afterAll(async () => {
    http.close();
    await aztecNode?.stop();
    await (aztecRpcServer as AztecRPCServer).stop();
  });

  beforeEach(() => {
    logs.splice(0);
    cli = getProgram(log, debug);
  });

  // Run a command on the CLI
  const run = (cmd: string, addRpcUrl = true) => {
    const args = stringArgv(cmd, 'node', 'dest/bin/index.js');
    if (addRpcUrl) {
      args.push('--rpc-url', `http://localhost:${HTTP_PORT}`);
    }
    return cli.parseAsync(args);
  };

  // Returns first match across all logs collected so far
  const findInLogs = (regex: RegExp) => {
    for (const log of logs) {
      const match = regex.exec(log);
      if (match) return match;
    }
  };

  it('creates a private key', async () => {
    await run('generate-private-key', false);
    const privKey = findInLogs(/Private\sKey:\s+(?<privKey>[a-fA-F0-9]+)/)?.groups?.privKey;
    expect(privKey).toHaveLength(64);
    privateKey = PrivateKey.fromString(privKey!);
  });

  it('creates an account', async () => {
    existingAccounts = await aztecRpcServer.getAccounts();
    await run(`create-account --private-key ${privateKey.toString()}`);
    const newAddress = findInLogs(/Address:\s+(?<address>0x[a-fA-F0-9]+)/)?.groups?.address;
    expect(newAddress).toBeDefined();

    const accountsAfter = await aztecRpcServer.getAccounts();
    const expectedAccounts = [...existingAccounts.map(a => a.address), AztecAddress.fromString(newAddress!)];
    expect(accountsAfter.map(a => a.address)).toEqual(expectedAccounts);
    ownerAddress = accountsAfter[accountsAfter.length - 1];
    receiverAddress = accountsAfter[0];
  });

  it('deploys a contract', async () => {
    await run(`deploy PrivateTokenContractAbi --args ${INITIAL_BALANCE} ${ownerAddress.address} --salt 0`);
    const loggedAddress = findInLogs(/Contract\sdeployed\sat\s+(?<address>0x[a-fA-F0-9]+)/)?.groups?.address;
    expect(loggedAddress).toBeDefined();
    contractAddress = AztecAddress.fromString(loggedAddress!);

    const deployedContract = await aztecRpcServer.getContractData(contractAddress);
    expect(deployedContract?.contractAddress).toEqual(contractAddress);
  });

  it('checks contract owner balance', async () => {
    await run(
      `call getBalance --args ${
        ownerAddress.address
      } --contract-abi PrivateTokenContractAbi --contract-address ${contractAddress.toString()}`,
    );
    const result = findInLogs(/View\sresult:\s+(?<data>\S+)/)?.groups?.data;
    expect(result!).toEqual(`${BigInt(INITIAL_BALANCE).toString()}n`);
  });

  it('transfers some tokens & checks receiver balance', async () => {
    await run(
      `send transfer --args ${TRANSFER_BALANCE} ${ownerAddress.address} ${
        receiverAddress.address
      } --contract-address ${contractAddress.toString()} --contract-abi PrivateTokenContractAbi --private-key ${privateKey.toString()}`,
    );
    await run(
      `call getBalance --args ${receiverAddress.address.toString()} --contract-abi PrivateTokenContractAbi --contract-address ${contractAddress.toString()}`,
    );
    const result = findInLogs(/View\sresult:\s+(?<data>\S+)/)?.groups?.data;
    expect(result).toEqual(`${BigInt(TRANSFER_BALANCE).toString()}n`);
  });
});
