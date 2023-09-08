import { createAztecRpcClient, createDebugLogger, makeFetch, waitForSandbox } from '@aztec/aztec.js';
import { getProgram } from '@aztec/cli';
import { AztecRPC } from '@aztec/types';

import stringArgv from 'string-argv';
import { format } from 'util';

const debug = createDebugLogger('aztec:e2e_cli');

const { SANDBOX_URL = 'http://localhost:8080' } = process.env;

describe('CLI docs sandbox', () => {
  let cli: ReturnType<typeof getProgram>;
  let aztecRpc: AztecRPC;
  let log: (...args: any[]) => void;

  // All logs emitted by the cli will be collected here, and reset between tests
  const logs: string[] = [];

  beforeAll(async () => {
    aztecRpc = createAztecRpcClient(SANDBOX_URL, makeFetch([1, 2, 3], true));
    await waitForSandbox(aztecRpc);

    log = (...args: any[]) => {
      logs.push(format(...args));
      debug(...args);
    };
  });

  // in order to run the same command twice, we need to create a new CLI instance
  const resetCli = () => {
    cli = getProgram(log, debug);
  };

  beforeEach(() => {
    logs.splice(0);
    resetCli();
  });

  // Run a command on the CLI
  const run = (cmd: string, addRpcUrl = true) => {
    const args = stringArgv(cmd, 'node', 'dest/bin/index.js');
    if (addRpcUrl) {
      args.push('--rpc-url', SANDBOX_URL);
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

  const findMultipleInLogs = (regex: RegExp) => {
    const matches = [];
    for (const log of logs) {
      const match = regex.exec(log);
      if (match) matches.push(match);
    }
    return matches;
  };

  const clearLogs = () => {
    logs.splice(0);
  };

  it('correctly prints example contracts', async () => {
    const docs = `
// docs:start:example-contracts
% aztec-cli example-contracts
ChildContractAbi
DocsExampleContractAbi
EasyPrivateTokenContractAbi
EcdsaAccountContractAbi
EscrowContractAbi
ImportTestContractAbi
LendingContractAbi
MultiTransferContractAbi
NativeTokenContractAbi
NonNativeTokenContractAbi
ParentContractAbi
PendingCommitmentsContractAbi
PokeableTokenContractAbi
PriceFeedContractAbi
PrivateTokenAirdropContractAbi
PrivateTokenContractAbi
PublicTokenContractAbi
SchnorrAccountContractAbi
SchnorrAuthWitnessAccountContractAbi
SchnorrHardcodedAccountContractAbi
SchnorrSingleKeyAccountContractAbi
TestContractAbi
UniswapContractAbi
// docs:end:example-contracts
`;

    const command = docs.split('\n')[2].split('aztec-cli ')[1];
    const expectedConsoleOutput = docs.split('\n').slice(3, -2);

    await run(command, false);
    expect(logs).toEqual(expectedConsoleOutput);
  });
});
