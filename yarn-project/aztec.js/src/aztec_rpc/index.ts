import { AztecAddress, EthAddress, Fr, Signature, Tx, TxHash, TxRequest } from './circuit_js.js';

export * from './circuit_js.js';

export interface TxReceipt {
  txHash: TxHash;
  // txIndex: number;
  blockHash: Buffer;
  blockNumber: number;
  from: AztecAddress;
  to?: AztecAddress;
  contractAddress?: AztecAddress;
  status: boolean;
}

export interface AztecRPCClient {
  addAccount(): Promise<AztecAddress>;
  getAccounts(): Promise<AztecAddress[]>;
  getCode(contract: AztecAddress): Promise<Buffer>;
  createDeploymentTxRequest(
    bytecode: Buffer,
    args: Fr[],
    portalContract: EthAddress,
    contractAddressSalt: Fr,
    from: AztecAddress,
  ): Promise<TxRequest>;
  createTxRequest(functionSelector: Buffer, args: Fr[], to: AztecAddress, from: AztecAddress): Promise<TxRequest>;
  signTxRequest(txRequest: TxRequest): Promise<Signature>;
  createTx(txRequest: TxRequest, signature: Signature): Promise<Tx>;
  sendTx(tx: Tx): Promise<TxHash>;
  // callTx(functionSelector: Buffer, args: Fr[], to: AztecAddress, from: AztecAddress): Promise<any>;
  getTxReceipt(txHash: TxHash): Promise<TxReceipt>;
}
