import { Fr } from '@aztec/foundation/curves/bn254';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import type { ContractProvider } from '@aztec/native';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { deserializeFromMessagePack, serializeWithMessagePack } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractDeploymentData } from '@aztec/stdlib/contract';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import type { PublicContractsDB } from '../public_db_sources.js';

export class ContractProviderForCpp implements ContractProvider {
  private log: Logger;

  constructor(
    private contractsDB: PublicContractsDB,
    private globalVariables: GlobalVariables,
    bindings?: LoggerBindings,
  ) {
    this.log = createLogger('simulator:contract_provider_for_cpp', bindings);
  }

  public getContractInstance = async (address: string): Promise<Buffer | undefined> => {
    this.log.trace(`Contract provider callback: getContractInstance(${address})`);

    const aztecAddr = AztecAddress.fromString(address);

    const instance = await this.contractsDB.getContractInstance(aztecAddr, this.globalVariables.timestamp);

    if (!instance) {
      this.log.debug(`Contract instance not found: ${address}`);
      return undefined;
    }

    return serializeWithMessagePack(instance);
  };

  public getContractClass = async (classId: string): Promise<Buffer | undefined> => {
    this.log.trace(`Contract provider callback: getContractClass(${classId})`);

    // Parse classId string to Fr
    const classIdFr = Fr.fromString(classId);

    // Fetch contract class from the contracts DB
    const contractClass = await this.contractsDB.getContractClass(classIdFr);

    if (!contractClass) {
      this.log.debug(`Contract class not found: ${classId}`);
      return undefined;
    }

    return serializeWithMessagePack(contractClass);
  };

  public addContracts = async (contractDeploymentDataBuffer: Buffer): Promise<void> => {
    this.log.trace(`Contract provider callback: addContracts`);

    const rawData: any = deserializeFromMessagePack(contractDeploymentDataBuffer);

    // Construct ContractDeploymentData from plain object.
    const contractDeploymentData = ContractDeploymentData.fromPlainObject(rawData);

    // Add contracts to the contracts DB
    this.log.trace(`Calling contractsDB.addContracts`);
    await this.contractsDB.addContracts(contractDeploymentData);
  };

  public getBytecodeCommitment = async (classId: string): Promise<Buffer | undefined> => {
    this.log.trace(`Contract provider callback: getBytecodeCommitment(${classId})`);

    // Parse classId string to Fr
    const classIdFr = Fr.fromString(classId);

    // Fetch bytecode commitment from the contracts DB
    const commitment = await this.contractsDB.getBytecodeCommitment(classIdFr);

    if (!commitment) {
      this.log.debug(`Bytecode commitment not found: ${classId}`);
      return undefined;
    }

    // Serialize the Fr to buffer
    return serializeWithMessagePack(commitment);
  };

  public getDebugFunctionName = async (address: string, selector: string): Promise<string | undefined> => {
    this.log.trace(`Contract provider callback: getDebugFunctionName(${address}, ${selector})`);

    // Parse address and selector strings
    const aztecAddr = AztecAddress.fromString(address);
    const selectorFr = Fr.fromString(selector);
    const functionSelector = FunctionSelector.fromFieldOrUndefined(selectorFr);

    if (!functionSelector) {
      this.log.trace(`calldata[0] is not a function selector: ${selector}`);
      return undefined;
    }

    // Fetch debug function name from the contracts DB
    const name = await this.contractsDB.getDebugFunctionName(aztecAddr, functionSelector);

    if (!name) {
      this.log.trace(`Debug function name not found for ${address}:${selector}`);
      return undefined;
    }

    return name;
  };

  public createCheckpoint = (): Promise<void> => {
    this.log.trace(`Contract provider callback: createCheckpoint`);
    return Promise.resolve(this.contractsDB.createCheckpoint());
  };

  public commitCheckpoint = (): Promise<void> => {
    this.log.trace(`Contract provider callback: commitCheckpoint`);
    return Promise.resolve(this.contractsDB.commitCheckpoint());
  };

  public revertCheckpoint = (): Promise<void> => {
    this.log.trace(`Contract provider callback: revertCheckpoint`);
    return Promise.resolve(this.contractsDB.revertCheckpoint());
  };
}
