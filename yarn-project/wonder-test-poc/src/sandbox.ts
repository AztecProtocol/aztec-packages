import { createAccount, getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { AztecAddress, ContractFunctionInteraction, ContractInstanceWithAddress, EthAddress, Fr, FunctionArtifact, FunctionSelector, PXE, PackedArguments, Tx, TxExecutionRequest, TxHash, createPXEClient, encodeArguments, initAztecJs } from '@aztec/aztec.js';
import { toACVMField } from '@aztec/simulator';



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
  let accounts = await createAccount(pxe);
  let deployedContract = await MeaningOfLifeContract.deploy(accounts).send().deployed();

  let instance: ContractInstanceWithAddress = deployedContract.instance;
  contractClassId = instance.contractClassId;

  await pxe.registerContract({ instance, artifact: MeaningOfLifeContract.artifact });

  // Resolve the function selectors and store them
  MeaningOfLifeContract.artifact.functions.forEach((f: FunctionArtifact) => {
    selectorsResolved.set(FunctionSelector.fromNameAndParameters(f.name, f.parameters).toString(), f.name);
  });

  console.log('Contract deployed at: ' + deployedContract.address.toString());

  return deployedContract.address;
};

// todo: add notes -> how to catch them? Or passed as args (cumbersome++)
export const privateCall = async (
  pxe: PXE,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  arg: Fr,
) => {
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
  let result = await deployedContract.methods.set_value(arg).send().wait();

  console.log('private call to contract: ', contractAddress.toString(), ' with args: ', arg.toString());

  return result.txHash;
};

export const publicCall = async (
  pxe: PXE,
  contractAddress: AztecAddress,
  functionSelector: FunctionSelector,
  arg: Fr,
) => {
  // This is the same as privateCall for now -> hopefully, context will be different
  let wallet = await createAccount(pxe);

  let deployedContract = await MeaningOfLifeContract.at(contractAddress, wallet);

  let result = await deployedContract
    .withWallet(wallet)
    .methods.public_function_to_call(arg)
    .send({ skipPublicSimulation: false })
    .wait({ debug: true });

  console.log('public call to contract: ', contractAddress.toString(), ' with args: ', arg.toString());

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

  console.log(
    'unconstrained call to ',
    methodName,
    ' at: ',
    contractAddress.toString(),
    ' with args: ',
    args.toString(),
    '\n result: ',
    result.toString(),
  );

  return result;
};

export const publicStorageRead = async (pxe: PXE, contractAddress: AztecAddress, storageSlot: Fr) => {
  let result = await pxe.getPublicStorageAt(contractAddress, storageSlot);

  console.log(
    'public storage read from contract: ',
    contractAddress.toString(),
    ' with slot: ',
    storageSlot.toString(),
    '\nresult: ',
    result.toString(),
  );
  
  return result;
};