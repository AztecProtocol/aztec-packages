import { AcirSimulator } from '@aztec/acir-simulator';
import { AztecNode } from '@aztec/aztec-node';
import { KernelProver } from '@aztec/kernel-prover';
import { Tx } from '@aztec/p2p';
import { generateFunctionSelector } from '../abi_coder/index.js';
import { AztecRPCClient } from '../aztec_rpc_client/index.js';
import {
  AztecAddress,
  ContractDeploymentData,
  EthAddress,
  Fr,
  FunctionData,
  OldTreeRoots,
  TxContext,
} from '@aztec/circuits.js';
import { ContractDao, ContractDataSource } from '../contract_data_source/index.js';
import { KeyStore } from '../key_store/index.js';
import { ContractAbi } from '../noir.js';
import { Synchroniser } from '../synchroniser/index.js';
import { TxHash } from '../tx/index.js';
import { generateContractAddress, selectorToNumber, Signature, TxRequest, ZERO_FR } from '../circuits.js';
import { randomBytes } from '@aztec/foundation';

export class AztecRPCServer implements AztecRPCClient {
  constructor(
    private keyStore: KeyStore,
    private synchroniser: Synchroniser,
    private acirSimulator: AcirSimulator,
    private kernelProver: KernelProver,
    private node: AztecNode,
    private db: ContractDataSource,
  ) {}

  public async addAccount() {
    const accountPublicKey = await this.keyStore.addAccount();
    await this.synchroniser.addAccount(accountPublicKey);
    return accountPublicKey;
  }

  public getAccounts() {
    return Promise.resolve(this.synchroniser.getAccounts().map(a => a.publicKey));
  }

  public getStorageAt(contract: AztecAddress, storageSlot: Fr) {
    return Promise.resolve();
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

    const functionData = new FunctionData(
      selectorToNumber(generateFunctionSelector(constructorAbi.name, constructorAbi.parameters)),
      true,
      true,
    );

    const constructorVkHash = ZERO_FR;
    const functionTreeRoot = ZERO_FR;
    const contractDeploymentData = new ContractDeploymentData(
      constructorVkHash,
      functionTreeRoot,
      contractAddressSalt,
      portalContract,
    );
    const txContext = new TxContext(false, false, true, contractDeploymentData);

    const contractAddress = generateContractAddress(from, contractAddressSalt, args);
    await this.db.addContract(contractAddress, portalContract, abi, false);

    console.log(`Function data ${functionData.isConstructor}`);

    return new TxRequest(
      from,
      contractAddress,
      functionData,
      args,
      txContext,
      new Fr(randomBytes(Fr.SIZE_IN_BYTES)), // nonce
      ZERO_FR, // chainId
    );
  }

  public async createTxRequest(functionSelector: Buffer, args: Fr[], to: AztecAddress, from: AztecAddress) {
    const contract = await this.db.getContract(to);
    if (!contract) {
      throw new Error('Unknown contract.');
    }

    const functionDao = this.findFunction(contract, functionSelector);

    const functionData = new FunctionData(
      functionSelector.readUint32BE(),
      functionDao.isSecret as any, // TODO: remove as any
      false as any, // TODO: remove as any
    );

    const txContext = new TxContext(
      false,
      false,
      true,
      new ContractDeploymentData(ZERO_FR, ZERO_FR, ZERO_FR, new EthAddress(Buffer.alloc(EthAddress.SIZE_IN_BYTES))),
    );

    return new TxRequest(
      from,
      to,
      functionData,
      args,
      txContext,
      new Fr(randomBytes(Fr.SIZE_IN_BYTES)), // nonce
      ZERO_FR, // chainId
    );
  }

  public signTxRequest(txRequest: TxRequest) {
    return this.keyStore.signTxRequest(txRequest);
  }

  public async createTx(txRequest: TxRequest, signature: Signature) {
    let contractAddress;

    if (txRequest.to.toBuffer().equals(ZERO_FR.toBuffer())) {
      contractAddress = generateContractAddress(
        txRequest.from,
        txRequest.txContext.contractDeploymentData.contractAddressSalt,
        txRequest.args,
      );
    } else {
      contractAddress = txRequest.to;
      console.log(`to is not zero ${contractAddress.toBuffer().toString('hex')}`);
    }

    const contract = await this.db.getContract(contractAddress);

    if (!contract) {
      throw new Error('Unknown contract.');
    }

    const selector = Buffer.alloc(4);
    selector.writeUint32BE(txRequest.functionData.functionSelector);

    const functionDao = this.findFunction(contract, selector);

    const oldRoots = new OldTreeRoots(ZERO_FR, ZERO_FR, ZERO_FR, ZERO_FR); // TODO - get old roots from the database/node
    const executionResult = await this.acirSimulator.run(
      txRequest,
      Buffer.from(functionDao.bytecode, 'base64'),
      contract.portalAddress,
      oldRoots,
    );
    const { publicInputs } = await this.kernelProver.prove(
      txRequest as any, // TODO - remove `as any`
      signature,
      executionResult,
      oldRoots as any, // TODO - remove `as any`
    );
    // TODO I think the TX should include all the data from the publicInputs + proof
    return new Tx(publicInputs);
  }

  public async sendTx(tx: Tx) {
    await this.node.sendTx(tx);
    return new TxHash(tx.txId);
  }

  public getTxReceipt(txHash: TxHash) {
    return this.synchroniser.getTxReceipt(txHash);
  }

  private findFunction(contract: ContractDao, functionSelector: Buffer) {
    const functionDao = contract.functions.find(f => f.selector.equals(functionSelector));
    if (!functionDao) {
      throw new Error('Unknown function.');
    }
    return functionDao;
  }
}
