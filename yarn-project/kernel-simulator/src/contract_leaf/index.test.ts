import { EthAddress, GrumpkinAddress } from '@aztec/barretenberg/address';
import { SinglePedersen } from '@aztec/barretenberg/crypto';
import { BarretenbergWasm } from '@aztec/barretenberg/wasm';
import { computeContractAddress, computeContractLeaf } from './contract_leaf.js';
import ExampleABI from './fixtures/abi.js';
import { createFunctionsTree } from './index.js';

describe('Contract leaf test suite', () => {
  const deployerAddress = GrumpkinAddress.random();
  const deploymentSalt = Buffer.alloc(32);
  const args = Buffer.alloc(256);

  let singlePedersen: SinglePedersen;

  beforeAll(async () => {
    singlePedersen = new SinglePedersen(await BarretenbergWasm.new());
  });

  it('should generate function trees', async () => {
    const functionTree = await createFunctionsTree(ExampleABI, singlePedersen);

    expect(functionTree.getRoot().byteLength).toBe(32);
    expect(functionTree.getSize()).toBe(32);
  });

  it('should generate contract addresses', async () => {
    const functionsTree = await createFunctionsTree(ExampleABI, singlePedersen);

    const contractAddress = computeContractAddress(
      deployerAddress,
      deploymentSalt,
      args,
      functionsTree.getRoot(),
      ExampleABI,
      singlePedersen,
    );

    expect(contractAddress.byteLength).toBe(32);
  });

  it('should generate contract leaves', async () => {
    const functionsTree = await createFunctionsTree(ExampleABI, singlePedersen);

    const contractLeaf = computeContractLeaf(
      computeContractAddress(
        deployerAddress,
        deploymentSalt,
        args,
        functionsTree.getRoot(),
        ExampleABI,
        singlePedersen,
      ),
      EthAddress.random(),
      functionsTree.getRoot(),
      singlePedersen,
    );

    expect(contractLeaf.byteLength).toBe(32);
  });
});
