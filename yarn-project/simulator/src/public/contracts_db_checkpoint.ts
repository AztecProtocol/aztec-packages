import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClassPublic, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

export class ContractsDbCheckpoint {
  private instances: Map<string, ContractInstanceWithAddress> = new Map();
  private classes: Map<string, ContractClassPublic> = new Map();
  private bytecodeCommitments: Map<string, Fr> = new Map();

  public addInstance(address: AztecAddress, instance: ContractInstanceWithAddress): void {
    this.instances.set(address.toString(), instance);
  }

  public addClass(classId: Fr, contractClass: ContractClassPublic): void {
    this.classes.set(classId.toString(), contractClass);
  }

  public addBytecodeCommitment(classId: Fr, commitment: Fr): void {
    this.bytecodeCommitments.set(classId.toString(), commitment);
  }

  public getInstance(address: AztecAddress): ContractInstanceWithAddress | undefined {
    return this.instances.get(address.toString());
  }

  public getClass(classId: Fr): ContractClassPublic | undefined {
    return this.classes.get(classId.toString());
  }

  public getBytecodeCommitment(classId: Fr): Fr | undefined {
    return this.bytecodeCommitments.get(classId.toString());
  }

  public deepCopy(): ContractsDbCheckpoint {
    const copy = new ContractsDbCheckpoint();
    this.instances.forEach((value, key) => copy.instances.set(key, value));
    this.classes.forEach((value, key) => copy.classes.set(key, value));
    this.bytecodeCommitments.forEach((value, key) => copy.bytecodeCommitments.set(key, value));
    return copy;
  }
}
