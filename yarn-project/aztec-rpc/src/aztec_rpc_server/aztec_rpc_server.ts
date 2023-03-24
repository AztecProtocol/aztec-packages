import { AztecNode, Tx } from '@aztec/aztec-node';
import { generateFunctionSelector } from '../abi_coder/index.js';
import { AcirSimulator } from '../acir_simulator.js';
import { AztecRPCClient } from '../aztec_rpc_client/index.js';
import {
  AztecAddress,
  ContractDeploymentData,
  EthAddress,
  Fr,
  generateContractAddress,
  KernelPrivateInputs,
  Signature,
  TxContext,
  TxRequest,
} from '../circuits.js';
import { Database } from '../database/index.js';
import { KeyStore } from '../key_store/index.js';
import { ContractAbi } from '../noir.js';
import { ProofGenerator } from '../proof_generator/index.js';
import { Synchroniser } from '../synchroniser/index.js';
import { TxHash } from '../tx/index.js';

export class AztecRPCServer implements AztecRPCClient {
  constructor(
    private keyStore: KeyStore,
    private synchroniser: Synchroniser,
    private simulator: AcirSimulator,
    private proofGenerator: ProofGenerator,
    private node: AztecNode,
    private db: Database,
  ) {}

  public addAccount() {
    return this.keyStore.addAccount();
  }

  public getAccounts() {
    return this.keyStore.getAccounts();
  }

  public getCode(contract: AztecAddress, functionSelector?: Buffer) {
    return this.db.getCode(contract, functionSelector || generateFunctionSelector('constructor', []));
  }

  public async createDeploymentTxRequest(
    abi: ContractAbi,
    args: Fr[],
    portalContract: EthAddress,
    contractAddressSalt: Fr,
    from: AztecAddress,
  ) {
    const constructorAbi = abi.functions.find(f => f.name === 'constructor');
    if (!constructorAbi) {
      throw new Error('Cannot find constructor in the ABI.');
    }

    const functionData = {
      functionSelector: generateFunctionSelector(constructorAbi.name, constructorAbi.parameters),
      isSecret: true,
      isContructor: true,
    };

    const contractDataHash = Fr.ZERO;
    const functionTreeRoot = Fr.ZERO;
    const constructorHash = Fr.ZERO;
    const contractDeploymentData = new ContractDeploymentData(
      contractDataHash,
      functionTreeRoot,
      constructorHash,
      contractAddressSalt,
      portalContract,
    );
    const txContext = new TxContext(false, false, false, contractDeploymentData);

    const contractAddress = generateContractAddress(from, contractAddressSalt, args);
    await this.db.addContract(contractAddress, abi, false);

    return new TxRequest(
      from,
      AztecAddress.ZERO, // to
      functionData,
      args,
      txContext,
      Fr.random(), // nonce
      Fr.ZERO, // chainId
    );
  }

  public async createTxRequest(functionSelector: Buffer, args: Fr[], to: AztecAddress, from: AztecAddress) {
    const abi = await this.db.getContract(to);
    if (!abi) {
      throw new Error('Unknown contract.');
    }

    const functionAbi = abi.functions.find(f => f.selector.equals(functionSelector));
    if (!functionAbi) {
      throw new Error('Unknown function.');
    }

    const functionData = {
      functionSelector,
      isSecret: functionAbi.isSecret,
      isContructor: false,
    };

    const txContext = new TxContext(false, false, false, ContractDeploymentData.EMPTY);

    return new TxRequest(
      from,
      to,
      functionData,
      args,
      txContext,
      Fr.random(), // nonce
      Fr.ZERO, // chainId
    );
  }

  public signTxRequest(txRequest: TxRequest) {
    return this.keyStore.signTxRequest(txRequest);
  }

  public async createTx(txRequest: TxRequest, signature: Signature) {
    const { kernelData, callData } = await this.simulator.simulate(txRequest);
    const privateInputs = new KernelPrivateInputs(txRequest, signature, kernelData, callData);
    const { accumulatedTxData } = await this.proofGenerator.createProof(privateInputs);
    return new Tx(accumulatedTxData);
  }

  public async sendTx(tx: Tx) {
    await this.node.sendTx(tx);
    return new TxHash(tx.txId);
  }

  public async getTxReceipt(txHash: TxHash) {
    const tx = await this.db.getTx(txHash);
    if (!tx) {
      return;
    }

    const account = this.synchroniser.getAccount(tx.from);
    if (!account) {
      throw new Error('Unauthorised account.');
    }

    return {
      txHash: tx.txHash,
      blockHash: tx.blockHash,
      blockNumber: tx.blockNumber,
      from: tx.from,
      to: tx.to,
      contractAddress: tx.contractAddress,
      error: tx.error,
      status: !tx.error,
    };
  }
}
