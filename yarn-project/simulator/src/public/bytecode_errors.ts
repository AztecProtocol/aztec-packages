export class UniqueContractCallsLimitReachedError extends Error {
  constructor(limit: number) {
    super(`Reached the limit on number of unique contract calss per tx: ${limit}`);
    this.name = 'UniqueContractCallsLimitReachedError';
  }
}

export class ContractClassBytecodeError extends Error {
  constructor(contractAddress: string) {
    super(`Failed to get bytecode for contract at address ${contractAddress}`);
    this.name = 'ContractClassBytecodeError';
  }
}
