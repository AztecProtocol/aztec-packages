import { PublicCallRequestWithCalldata, type Tx, TxExecutionPhase } from '@aztec/stdlib/tx';

export function getCallRequestsWithCalldataByPhase(tx: Tx, phase: TxExecutionPhase): PublicCallRequestWithCalldata[] {
  switch (phase) {
    case TxExecutionPhase.SETUP:
      return tx.getNonRevertiblePublicCallRequestsWithCalldata();
    case TxExecutionPhase.APP_LOGIC:
      return tx.getRevertiblePublicCallRequestsWithCalldata();
    case TxExecutionPhase.TEARDOWN: {
      const request = tx.getTeardownPublicCallRequestWithCalldata();
      return request ? [request] : [];
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}
