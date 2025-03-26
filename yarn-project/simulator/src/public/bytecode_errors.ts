export class ContractClassBytecodeError extends Error {
  constructor(contractAddress: string) {
    super(`Failed to get bytecode for contract at address ${contractAddress}`);
    this.name = 'ContractClassBytecodeError';
  }
}
