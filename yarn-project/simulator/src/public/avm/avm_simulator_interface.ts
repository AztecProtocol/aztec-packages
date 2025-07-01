/**
 * Interface for AvmSimulator to break the circular dependency between avm_context.ts and avm_simulator.ts
 */
export interface AvmSimulatorInterface {
  execute(): Promise<any>; // Using any here to avoid importing AvmContractCallResult
  executeBytecode(bytecode: Buffer): Promise<any>;
  getBytecode(): Buffer | undefined;
}
