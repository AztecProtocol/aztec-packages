import { CallRequest, EthereumRpc, TxHash } from '../eth_rpc/index.js';
import { ContractAbi } from './abi/contract_abi.js';

export function decodeErrorFromContract(contract: ContractAbi, data: Buffer) {
  const sigHash = data.subarray(0, 4);
  const args = data.subarray(4);

  const error = contract.errors.find(e => e.signature.equals(sigHash));
  if (!error) {
    return;
  }

  const errorValue = {
    name: error.name,
    params: error.decodeParameters(args),
  };

  return errorValue;
}

export async function decodeErrorFromContractByTxHash(contract: ContractAbi, txHash: TxHash, ethRpc: EthereumRpc) {
  const txResp = await ethRpc.getTransactionByHash(txHash);
  const rep = await ethRpc.call(txResp as CallRequest, txResp.blockNumber!);

  if (!rep) {
    return;
  }

  return decodeErrorFromContract(contract, rep);
}
