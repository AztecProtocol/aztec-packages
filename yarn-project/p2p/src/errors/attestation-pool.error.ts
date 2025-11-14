export class AttestationPoolError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'AttestationPoolError';
  }
}

export class ProposalSlotCapExceededError extends AttestationPoolError {
  constructor(message?: string) {
    super(message);
    this.name = 'ProposalSlotCapExceededError';
  }
}
