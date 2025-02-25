import { type PublicExecutionRequest, type Tx, TxExecutionPhase } from '@aztec/circuits.js';
import { type PublicCallRequest } from '@aztec/circuits.js/kernel';

export function getExecutionRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicExecutionRequest[] {
  switch (phase) {
    case TxExecutionPhase.SETUP:
      return tx.getNonRevertiblePublicExecutionRequests();
    case TxExecutionPhase.APP_LOGIC:
      return tx.getRevertiblePublicExecutionRequests();
    case TxExecutionPhase.TEARDOWN: {
      const request = tx.getPublicTeardownExecutionRequest();
      return request ? [request] : [];
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

export function getCallRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicCallRequest[] {
  switch (phase) {
    case TxExecutionPhase.SETUP:
      return tx.data.getNonRevertiblePublicCallRequests();
    case TxExecutionPhase.APP_LOGIC:
      return tx.data.getRevertiblePublicCallRequests();
    case TxExecutionPhase.TEARDOWN: {
      const request = tx.data.getTeardownPublicCallRequest();
      return request ? [request] : [];
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}
