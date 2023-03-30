import { makeAztecAddress, makeTxRequest } from '../tests/factories.js';
import { CircuitsWasm } from '../wasm/circuits_wasm.js';
import { computeContractAddress, computeFunctionSelector, hashTxRequest } from './abis.js';

describe('abis wasm bindings', () => {
  let wasm: CircuitsWasm;
  beforeEach(async () => {
    wasm = await CircuitsWasm.new();
  });
  it('hashes a tx request', () => {
    const txRequest = makeTxRequest();
    const hash = hashTxRequest(wasm, txRequest);
    console.log(hash);
    expect(hash).toBeTruthy();
  });

  it('computes a function selector', () => {
    const funcSig = 'transfer(address,uint256)';
    const res = computeFunctionSelector(wasm, funcSig);
    expect(res).toBeTruthy();
  });

  it('computes a contract address', () => {
    const deployerAddr = makeAztecAddress(1);
    const contractAddr = makeAztecAddress(2);
    const treeRoot = Buffer.alloc(32);
    const constructorHash = Buffer.alloc(32);
    const res = computeContractAddress(wasm, deployerAddr, contractAddr, treeRoot, constructorHash);
    expect(res).toBeTruthy();
  });
});
