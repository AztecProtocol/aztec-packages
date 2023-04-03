import { FunctionData } from '@aztec/circuits.js';
import {
  computeContractAddress,
  computeFunctionLeaf,
  computeFunctionTreeRoot,
  hashConstructor,
  hashVK,
} from '@aztec/circuits.js/abis';
import { CircuitsWasm } from '@aztec/circuits.js/wasm';
import { AztecAddress, EthAddress, Fr, keccak } from '@aztec/foundation';
import { generateFunctionSelector } from '../abi_coder/index.js';
import { ContractDao, ContractFunctionDao } from '../contract_database/index.js';
import { ContractAbi, FunctionType } from '@aztec/noir-contracts';

function isConstructor({ name }: { name: string }) {
  return name === 'constructor';
}

async function generateFunctionLeaves(functions: ContractFunctionDao[], wasm: CircuitsWasm) {
  return await Promise.all(
    functions
      .filter(f => f.functionType !== FunctionType.UNCONSTRAINED && !isConstructor(f))
      .map(async f => {
        const selector = generateFunctionSelector(f.name, f.parameters);
        const isPrivate = f.functionType === FunctionType.SECRET;
        // All non-unconstrained functions have vks
        const vkHash = await hashVK(wasm, Buffer.from(f.verificationKey!, 'hex'));
        const acirHash = keccak(Buffer.from(f.bytecode, 'hex'));
        return await computeFunctionLeaf(
          wasm,
          Buffer.concat([selector, Buffer.from([isPrivate ? 1 : 0]), vkHash, acirHash]),
        );
      }),
  );
}

export class ContractTree {
  private functionLeaves?: Buffer[];

  constructor(public readonly contract: ContractDao, private wasm: CircuitsWasm) {}

  static async new(
    abi: ContractAbi,
    args: Fr[],
    portalContract: EthAddress,
    contractAddressSalt: Fr,
    from: AztecAddress,
    wasm: CircuitsWasm,
  ) {
    const constructorFunc = abi.functions.find(isConstructor);
    if (!constructorFunc) {
      throw new Error('Constructor not found.');
    }

    const functions = abi.functions.map(f => ({
      ...f,
      selector: generateFunctionSelector(f.name, f.parameters),
    }));
    const leaves = await generateFunctionLeaves(functions, wasm);
    const functionTreeRoot = await computeFunctionTreeRoot(wasm, leaves);
    const root = Fr.fromBuffer(functionTreeRoot);
    const constructorSelector = generateFunctionSelector(constructorFunc.name, constructorFunc.parameters);
    const constructorHash = await hashConstructor(
      wasm,
      new FunctionData(constructorSelector),
      args,
      Buffer.from(constructorFunc.verificationKey!, 'hex'),
    );
    const address = await computeContractAddress(
      wasm,
      from,
      contractAddressSalt.toBuffer(),
      root.toBuffer(),
      constructorHash,
    );
    const contractDao: ContractDao = {
      ...abi,
      address,
      functions,
      portalContract,
    };
    return new ContractTree(contractDao, wasm);
  }

  async getFunctionLeaves() {
    if (!this.functionLeaves) {
      this.functionLeaves = await generateFunctionLeaves(this.contract.functions, this.wasm);
    }
    return this.functionLeaves;
  }

  async getFunctionTreeRoot() {
    const leaves = await this.getFunctionLeaves();
    const treeRoot = await computeFunctionTreeRoot(this.wasm, leaves);
    return Fr.fromBuffer(treeRoot);
  }
}
