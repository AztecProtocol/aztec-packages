import { AztecNode, Tx } from '@aztec/aztec-node';
import { AcirSimulator } from '@aztec/acir-simulator';
import { KernelProver } from '@aztec/kernel-prover';
import { generateFunctionSelector } from '../abi_coder/index.js';
import { AztecRPCClient } from '../aztec_rpc_client/index.js';
import {
  AztecAddress,
  ContractDeploymentData,
  EthAddress,
  Fr,
  generateContractAddress,
  OldTreeRoots,
  PrivateKernelPublicInputs,
  Signature,
  TxContext,
  TxRequest,
} from '../circuits.js';
import { Database } from '../database/index.js';
import { KeyStore } from '../key_store/index.js';
import { ContractAbi } from '../noir.js';
import { Synchroniser } from '../synchroniser/index.js';
import { TxHash } from '../tx/index.js';
import { AccumulatedTxData } from '@aztec/p2p';

export class AztecRPCServer implements AztecRPCClient {
  constructor(
    private keyStore: KeyStore,
    private synchroniser: Synchroniser,
    private acirSimulator: AcirSimulator,
    private kernelProver: KernelProver,
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

    const constructorVkHash = Fr.ZERO;
    const functionTreeRoot = Fr.ZERO;
    const contractDeploymentData = new ContractDeploymentData(
      constructorVkHash,
      functionTreeRoot,
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
    // TODO - get the contract/fn details from the db
    const entryPointACIR = Buffer.alloc(0);
    const portalContractAddress = EthAddress.ZERO;
    const oldRoots = new OldTreeRoots(Fr.ZERO, Fr.ZERO, Fr.ZERO, Fr.ZERO); // TODO - get old roots from the database
    const executionResult = await this.acirSimulator.run(txRequest, entryPointACIR, portalContractAddress, oldRoots);
    // TODO - kernel prover should use the signature along with the request
    const { publicInputs, proof } = await this.kernelProver.prove(txRequest, executionResult, oldRoots);
    return this.buildTx(publicInputs, proof);
  }

  private buildTx(publicInputs: PrivateKernelPublicInputs, proof: Buffer) {
    const accumulatedData = publicInputs.end;

    //TODO I think the TX should include all the data from the publicInputs + proof
    return new Tx(
      new AccumulatedTxData(
        accumulatedData.newCommitments.map(fr => fr.buffer),
        accumulatedData.newNullifiers.map(fr => fr.buffer),
        accumulatedData.privateCallStack.map(fr => fr.buffer),
        accumulatedData.publicCallStack.map(fr => fr.buffer),
        accumulatedData.l1MsgStack.map(fr => fr.buffer),
        accumulatedData.newContracts.map(() => Buffer.alloc(0)), // TODO: use toBuffer from circuits/ts
        accumulatedData.newCommitments.map(fr => fr.buffer),
        {}, // TODO aggregationObject from circuits/ts
        accumulatedData.privateCallCount.buffer.readUInt32BE(), // TODO: check if correct
      ),
    );
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
