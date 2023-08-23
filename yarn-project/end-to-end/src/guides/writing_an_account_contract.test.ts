import { AztecRPCServer } from '@aztec/aztec-rpc';
import {
  Account,
  AccountContract,
  CompleteAddress,
  CreateTxRequestOpts,
  Entrypoint,
  FunctionCall,
  NodeInfo,
  buildPayload,
  buildTxExecutionRequest,
  hashPayload,
} from '@aztec/aztec.js';
import { CircuitsWasm, PrivateKey } from '@aztec/circuits.js';
import { Schnorr } from '@aztec/circuits.js/barretenberg';
import { ContractAbi } from '@aztec/foundation/abi';
import { PrivateTokenContract, SchnorrHardcodedAccountContractAbi } from '@aztec/noir-contracts/types';

import { setup } from '../fixtures/utils.js';

const PRIVATE_KEY = PrivateKey.fromString('0xff2b5f8212061f0e074fc8794ffe8524130434889df20a912d7329e03894ccff');

/** Account contract implementation that authenticates txs using Schnorr signatures. */
class SchnorrHardcodedKeyAccountContract implements AccountContract {
  constructor(private privateKey: PrivateKey = PRIVATE_KEY) {}

  getContractAbi(): ContractAbi {
    // Return the ABI of the SchnorrHardcodedAccount contract.
    return SchnorrHardcodedAccountContractAbi;
  }

  getDeploymentArgs(): Promise<any[]> {
    // This contract does not require any arguments in its constructor.
    return Promise.resolve([]);
  }

  getEntrypoint(completeAddress: CompleteAddress, nodeInfo: NodeInfo): Promise<Entrypoint> {
    const privateKey = this.privateKey;
    const address = completeAddress.address;

    // Create a new Entrypoint object, whose responsibility is to turn function calls from the user
    // into a tx execution request ready to be simulated and sent.
    return Promise.resolve({
      async createTxExecutionRequest(calls: FunctionCall[], opts: CreateTxRequestOpts = {}) {
        // Validate that the requested origin matches (if set)
        if (opts.origin && !opts.origin.equals(address)) {
          throw new Error(`Sender ${opts.origin.toString()} does not match ${address.toString()}`);
        }

        // Assemble the EntrypointPayload out of the requested calls
        const { payload, packedArguments: callsPackedArguments } = await buildPayload(calls);

        // Hash the request payload and sign it using Schnorr
        const message = await hashPayload(payload);
        const signer = new Schnorr(await CircuitsWasm.get());
        const signature = signer.constructSignature(message, privateKey).toBuffer();

        // Collect the payload and its signature as arguments to the entrypoint
        const args = [payload, signature];

        // Capture the entrypoint function
        const entrypointMethod = SchnorrHardcodedAccountContractAbi.functions.find(f => f.name === 'entrypoint')!;

        // Assemble and return the tx execution request
        return buildTxExecutionRequest(address, entrypointMethod, args, callsPackedArguments, nodeInfo);
      },
    });
  }
}

describe('guides/writing_an_account_contract', () => {
  let context: Awaited<ReturnType<typeof setup>>;

  beforeEach(async () => {
    context = await setup(0);
  }, 60_000);

  afterEach(async () => {
    await context.aztecNode?.stop();
    if (context.aztecRpcServer instanceof AztecRPCServer) {
      await context.aztecRpcServer.stop();
    }
  });

  it('works', async () => {
    const { aztecRpcServer: rpc, logger } = context;
    const encryptionPrivateKey = PrivateKey.random();
    const account = new Account(rpc, encryptionPrivateKey, new SchnorrHardcodedKeyAccountContract());
    const wallet = await account.waitDeploy();
    const walletAddress = wallet.getCompleteAddress().address;
    logger(`Deployed account contract at ${walletAddress}`);

    const token = await PrivateTokenContract.deploy(wallet, 100, walletAddress).send().deployed();
    logger(`Deployed token contract at ${token.address}`);

    await token.methods.mint(50, walletAddress).send().wait();
    const balance = await token.methods.getBalance(walletAddress).view();
    logger(`Balance of wallet is now ${balance}`);

    expect(balance).toEqual(150n);

    const wrongKey = PrivateKey.random();
    const wrongAccountContract = new SchnorrHardcodedKeyAccountContract(wrongKey);
    const wrongAccount = new Account(rpc, encryptionPrivateKey, wrongAccountContract, wallet.getCompleteAddress());
    const wrongWallet = await wrongAccount.getWallet();
    const tokenWithWrongWallet = await PrivateTokenContract.at(token.address, wrongWallet);

    try {
      await tokenWithWrongWallet.methods.mint(200, walletAddress).simulate();
    } catch (err) {
      logger(`Failed to send tx: ${err}`);
    }
  }, 60_000);
});
