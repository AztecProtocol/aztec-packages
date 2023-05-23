/* eslint-disable camelcase */
import { AztecNode, getConfigEnvVars } from '@aztec/aztec-node';
import {
  AztecAddress,
  AztecRPCServer,
  Contract,
  ContractDeployer,
  ContractFunctionInteraction,
  Fr,
  TxStatus,
} from '@aztec/aztec.js';
import { ContractAbi, FunctionType } from '@aztec/foundation/abi';
import { createDebugLogger } from '@aztec/foundation/log';
import { AccountContractAbi, ChildAbi } from '@aztec/noir-contracts/examples';

import { ARGS_LENGTH, ContractDeploymentData, FunctionData, TxContext, TxRequest } from '@aztec/circuits.js';
import { padArrayEnd } from '@aztec/foundation/collection';
import times from 'lodash.times';
import { mnemonicToAccount } from 'viem/accounts';
import { createAztecRpcServer } from './create_aztec_rpc_client.js';
import { deployL1Contracts } from './deploy_l1_contracts.js';
import { MNEMONIC } from './fixtures.js';
import { toBigInt } from '@aztec/foundation/serialize';

const logger = createDebugLogger('aztec:e2e_account_contract');

const config = getConfigEnvVars();

describe('e2e_account_contract', () => {
  let node: AztecNode;
  let aztecRpcServer: AztecRPCServer;
  let accounts: AztecAddress[];

  let account: Contract;
  let child: Contract;

  beforeEach(async () => {
    const hdAccount = mnemonicToAccount(MNEMONIC);
    const privKey = hdAccount.getHdKey().privateKey;
    const { rollupAddress, unverifiedDataEmitterAddress } = await deployL1Contracts(config.rpcUrl, hdAccount, logger);

    config.publisherPrivateKey = Buffer.from(privKey!);
    config.rollupContract = rollupAddress;
    config.unverifiedDataEmitterContract = unverifiedDataEmitterAddress;

    node = await AztecNode.createAndSync(config);
    aztecRpcServer = await createAztecRpcServer(1, node);
    accounts = await aztecRpcServer.getAccounts();

    account = await deployContract(AccountContractAbi);
    child = await deployContract(ChildAbi);
  }, 60_000);

  afterEach(async () => {
    await node.stop();
    await aztecRpcServer.stop();
  });

  const deployContract = async (abi: ContractAbi) => {
    logger(`Deploying L2 contract ${abi.name}...`);
    const deployer = new ContractDeployer(abi, aztecRpcServer);
    const tx = deployer.deploy().send();

    await tx.isMined(0, 0.1);

    const receipt = await tx.getReceipt();
    const contract = new Contract(receipt.contractAddress!, abi, aztecRpcServer);
    logger(`L2 contract ${abi.name} deployed at ${contract.address}`);
    return contract;
  };

  // Copied from yarn-project/noir-contracts/src/contracts/account_contract/src/entrypoint.nr
  const ACCOUNT_MAX_PRIVATE_CALLS = 1;
  const ACCOUNT_MAX_PUBLIC_CALLS = 1;

  type FunctionCall = {
    args: Fr[];
    selector: Buffer;
    target: AztecAddress;
  };

  type EntrypointPayload = {
    flattened_args: Fr[];
    flattened_selectors: Fr[];
    flattened_targets: Fr[];
    signature: Fr;
    nonce: Fr;
  };

  const flattenPayload = (payload: EntrypointPayload) => {
    return [
      ...payload.flattened_args,
      ...payload.flattened_selectors,
      ...payload.flattened_targets,
      payload.signature,
      payload.nonce,
    ];
  };

  const buildPayload = (privateCalls: FunctionCall[], publicCalls: FunctionCall[]): EntrypointPayload => {
    const signature = Fr.random();
    const nonce = Fr.random();
    const emptyCall = { args: times(ARGS_LENGTH, Fr.zero), selector: Buffer.alloc(32), target: AztecAddress.ZERO };

    const calls = [
      ...padArrayEnd(privateCalls, emptyCall, ACCOUNT_MAX_PRIVATE_CALLS),
      ...padArrayEnd(publicCalls, emptyCall, ACCOUNT_MAX_PUBLIC_CALLS),
    ];

    return {
      flattened_args: calls.flatMap(call => padArrayEnd(call.args, Fr.ZERO, ARGS_LENGTH)),
      flattened_selectors: calls.map(call => Fr.fromBuffer(call.selector)),
      flattened_targets: calls.map(call => call.target.toField()),
      signature,
      nonce,
    };
  };

  const buildCall = (payload: EntrypointPayload) => {
    const txRequest: TxRequest = new TxRequest(
      accounts[0],
      account.address,
      new FunctionData(account.methods.entrypoint.selector, true, false),
      times(ARGS_LENGTH, Fr.zero),
      Fr.random(),
      new TxContext(false, false, false, ContractDeploymentData.empty()),
      Fr.ZERO,
    );

    txRequest.setPackedArg(0, flattenPayload(payload));

    return new ContractFunctionInteractionFromTxRequest(
      aztecRpcServer,
      account.address,
      'entrypoint',
      flattenPayload(payload),
      FunctionType.SECRET,
    ).withTxRequest(txRequest);
  };

  it('calls a private function', async () => {
    const childCall = {
      args: [new Fr(42n)],
      selector: child.methods.value.selector,
      target: child.address,
    };

    const payload = buildPayload([childCall], []);
    const call = buildCall(payload);
    const tx = call.send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
  });

  it('calls a public function', async () => {
    const childCall = {
      args: [new Fr(42n)],
      selector: child.methods.pubStoreValue.selector,
      target: child.address,
    };

    const payload = buildPayload([], [childCall]);
    const call = buildCall(payload);
    const tx = call.send({ from: accounts[0] });

    await tx.isMined(0, 0.1);
    const receipt = await tx.getReceipt();

    expect(receipt.status).toBe(TxStatus.MINED);
    expect(toBigInt((await node.getStorageAt(child.address, 1n))!)).toEqual(42n);
  });
});

// Extends ContractFunctionInteraction class to manually create the tx request
// in order to bypass argument encoding, so we can fake the unpacked args.
class ContractFunctionInteractionFromTxRequest extends ContractFunctionInteraction {
  public withTxRequest(txRequest: TxRequest) {
    this.txRequest = txRequest;
    return this;
  }
}
