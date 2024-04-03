import { getSchnorrAccount } from '@aztec/accounts/schnorr';
import { createAccount, getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import {
  AztecAddress,
  ContractFunctionInteraction,
  ContractInstanceWithAddress,
  DeployedContract,
  EthAddress,
  ExtendedContractData,
  Fr,
  FunctionArtifact,
  FunctionSelector,
  PXE,
  PackedArguments,
  Tx,
  TxExecutionRequest,
  TxHash,
  createPXEClient,
  encodeArguments,
  initAztecJs,
} from '@aztec/aztec.js';
import { FunctionData, TxContext } from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';

import { MeaningOfLifeContract } from './artifacts/MeaningOfLife.js';

let selectorsResolved = new Map<string, string>();
let contractClassId: Fr = new Fr(0);

export const initSandbox = async () => {
  const SANDBOX_URL = 'http://localhost:8080';
  const pxe = createPXEClient(SANDBOX_URL);
  await initAztecJs();

  return pxe;
};

export const deployContract = async (pxe: PXE) => {
  console.log(' ----- deploying contract -----');
  let accounts = await createAccount(pxe);

  console.log('deployer account: ', accounts.getAddress());

  let deployedContract = await MeaningOfLifeContract.deploy(accounts).send().deployed();

  console.log('target address: ', deployedContract.address.toString());

  let instance: ContractInstanceWithAddress = deployedContract.instance;
  contractClassId = instance.contractClassId;

  let deployedContractInstance: DeployedContract = {
    artifact: MeaningOfLifeContract.artifact,
    instance,
  };

  await pxe.addContracts([deployedContractInstance]);

  console.log(' ----- contract deployed -----');
  // Resolve the function selectors and store them
  MeaningOfLifeContract.artifact.functions.forEach((f: FunctionArtifact) => {
    selectorsResolved.set(FunctionSelector.fromNameAndParameters(f.name, f.parameters).toString(), f.name);
  });

  return deployedContract.address;
};

// todo: add notes -> how to catch them? Or passed as args (cumbersome++)
export const privateCall = async (
  pxe: PXE,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  args: Fr[],
) => {
  // const functionName = selectorsResolved.get(functionSelector.toString());

  // const functionArtifact = MeaningOfLifeContract.artifact.functions.find(
  //   (f: FunctionArtifact) => f.name === functionName
  // );

  // if (!functionArtifact) {
  //   throw new Error("Function not found");
  // }

  // const functionData = new FunctionData(functionSelector, false, true, false);

  // // todo: arg type should be fixed here (we pass arrays even for single fields)
  // const packedArguments = PackedArguments.fromArgs(
  //   encodeArguments(functionArtifact, [args[0]])
  // );

  // const txContext = TxContext.empty();
  // txContext.contractDeploymentData.contractClassId = contractClassId;

  // // todo: mocking?
  // const txExecutionRequest = TxExecutionRequest.from({
  //   origin: contractAddress,
  //   argsHash: computeVarArgsHash([args[0]]),
  //   functionData,
  //   txContext,
  //   packedArguments: [packedArguments],
  //   authWitnesses: [],
  // });

  // let tx: Tx = await pxe.simulateTx(txExecutionRequest, true);

  // // TODO: this is not correct or not enough -> sendTx tries to send the tx to the mempool (via the node/p2p server),
  // // -> we need to build a block and publish it
  // let txHash = await pxe.sendTx(tx);

  // TODO: obv easier this way, not sure how to mock sender in the future tho:
  let wallet = await createAccount(pxe);
  let deployedContract = await MeaningOfLifeContract.at(contractAddress, wallet);

  // TODO: use the fn selector instead
  let result = await deployedContract.methods.set_value(args[0].toField()).send().wait();

  return result.txHash;
};

export const publicCall = async (
  pxe: PXE,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  args: Fr,
) => {
  // This is the same as privateCall for now -> hopefully, context will be different
  let wallet = await createAccount(pxe);
  let deployedContract = await MeaningOfLifeContract.at(contractAddress, wallet);
  console.log('args ', args.toField());
  let result = await deployedContract
    .withWallet(wallet)
    .methods.public_function_to_call(args.toField())
    .send({ skipPublicSimulation: false })
    .wait({ debug: true });

  console.log(result.txHash);
  return result.txHash;
};

export const unconstrainedCall = async (
  pxe: PXE,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  args: any[],
) => {
  // reverse lookup the fn selector
  let methodName = selectorsResolved.get(functionSelector.toString());

  if (!methodName) {
    throw new Error('Function not found');
  }

  // make the unconstrained call
  let result = await pxe.viewTx(methodName, args, contractAddress);

  return result;
};
