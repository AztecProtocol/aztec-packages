import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { ContractProvider } from '@aztec/native';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { deserializeFromMessagePack, serializeWithMessagePack } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { ContractDeploymentData } from '@aztec/stdlib/contract';
import { ContractClassLog, ContractClassLogFields, PrivateLog } from '@aztec/stdlib/logs';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import type { PublicContractsDB } from '../public_db_sources.js';

export class ContractProviderForCpp implements ContractProvider {
  private log: Logger = createLogger('simulator:contract_provider_for_cpp');

  constructor(
    private contractsDB: PublicContractsDB,
    private globalVariables: GlobalVariables,
  ) {}

  public getContractInstance = async (address: string): Promise<Buffer | undefined> => {
    this.log.debug(`Contract provider callback: getContractInstance(${address})`);

    const aztecAddr = AztecAddress.fromString(address);

    const instance = await this.contractsDB.getContractInstance(aztecAddr, this.globalVariables.timestamp);

    if (!instance) {
      this.log.debug(`Contract instance not found: ${address}`);
      return undefined;
    }

    return serializeWithMessagePack(instance);
  };

  public getContractClass = async (classId: string): Promise<Buffer | undefined> => {
    this.log.debug(`Contract provider callback: getContractClass(${classId})`);

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
    this.log.debug(`Contract provider callback: addContracts`);

    const rawData = deserializeFromMessagePack<any>(contractDeploymentDataBuffer);

    // Construct class instances using the from method
    const contractDeploymentData = this.reconstructContractDeploymentData(rawData);

    // Add contracts to the contracts DB
    this.log.debug(`Calling contractsDB.addContracts`);
    await this.contractsDB.addContracts(contractDeploymentData);
  };

  public getBytecodeCommitment = async (classId: string): Promise<Buffer | undefined> => {
    this.log.debug(`Contract provider callback: getBytecodeCommitment(${classId})`);

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
    this.log.debug(`Contract provider callback: getDebugFunctionName(${address}, ${selector})`);

    // Parse address and selector strings
    const aztecAddr = AztecAddress.fromString(address);
    const selectorFr = Fr.fromString(selector);
    const functionSelector = FunctionSelector.fromField(selectorFr);

    // Fetch debug function name from the contracts DB
    const name = await this.contractsDB.getDebugFunctionName(aztecAddr, functionSelector);

    if (!name) {
      this.log.debug(`Debug function name not found for ${address}:${selector}`);
      return undefined;
    }

    return name;
  };

  public createCheckpoint = (): Promise<void> => {
    this.log.debug(`Contract provider callback: createCheckpoint`);
    return Promise.resolve(this.contractsDB.createCheckpoint());
  };

  public commitCheckpoint = (): Promise<void> => {
    this.log.debug(`Contract provider callback: commitCheckpoint`);
    return Promise.resolve(this.contractsDB.commitCheckpoint());
  };

  public revertCheckpoint = (): Promise<void> => {
    this.log.debug(`Contract provider callback: revertCheckpoint`);
    return Promise.resolve(this.contractsDB.revertCheckpoint());
  };

  /**
   * Reconstruct ContractDeploymentData from plain msgpack-deserialized objects.
   *
   * msgpackr does not automatically apply extensions to nested fields, so we need to
   * manually reconstruct ContractClassLog and PrivateLog instances with proper types.
   *
   * TODO(dbanks12): we really shouldn't have to do this.... We need to for now because
   * msgpack deserialization doesn't give us actual typed objects, but rather just JSON.
   * It would be easier if all types matched between languages (like AztecAddress which is just
   * FF in C++).
   */
  private reconstructContractDeploymentData(rawData: any): ContractDeploymentData {
    // Helper to ensure a value is an Fr instance
    const toFr = (value: any): Fr => {
      if (value instanceof Fr) {
        return value;
      }
      if (Buffer.isBuffer(value)) {
        return Fr.fromBuffer(value);
      }
      return new Fr(value);
    };

    // Reconstruct ContractClassLogs
    const contractClassLogs = (rawData.contractClassLogs || []).map((log: any) => {
      // Convert contractAddress to TS AztecAddress
      const addressFr = toFr(log.contractAddress);
      const address = AztecAddress.fromField(addressFr);

      // Ensure all fields are Fr instances
      const fields = (log.fields.fields || []).map((field: any) => toFr(field));

      // Create proper ContractClassLog instance
      return new ContractClassLog(address, new ContractClassLogFields(fields), log.emittedLength);
    });

    // Reconstruct PrivateLogs - ensure fields are Fr instances
    const privateLogs = (rawData.privateLogs || []).map((log: any) => {
      const fields = (log.fields || []).map((field: any) => toFr(field));
      return new PrivateLog(fields as any, log.emittedLength);
    });

    return new ContractDeploymentData(contractClassLogs, privateLogs);
  }
}
