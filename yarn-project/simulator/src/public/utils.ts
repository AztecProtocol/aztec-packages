import { type PublicExecutionRequest, type Tx, TxExecutionPhase } from '@aztec/circuit-types';
import { type PrivateToPublicAccumulatedData, PublicAccumulatedData, type PublicCallRequest } from '@aztec/circuits.js';

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

export function convertPrivateToPublicAccumulatedData(
  fromPrivate: PrivateToPublicAccumulatedData,
): PublicAccumulatedData {
  const to = PublicAccumulatedData.empty();
  to.noteHashes.forEach((_, i) => (to.noteHashes[i].noteHash.value = fromPrivate.noteHashes[i]));
  to.nullifiers.forEach((_, i) => (to.nullifiers[i].value = fromPrivate.nullifiers[i]));
  to.l2ToL1Msgs.forEach((_, i) => (to.l2ToL1Msgs[i] = fromPrivate.l2ToL1Msgs[i]));
  to.noteEncryptedLogsHashes.forEach(
    (_, i) => (to.noteEncryptedLogsHashes[i] = fromPrivate.noteEncryptedLogsHashes[i]),
  );
  to.encryptedLogsHashes.forEach((_, i) => (to.encryptedLogsHashes[i] = fromPrivate.encryptedLogsHashes[i]));
  to.publicCallStack.forEach((_, i) => (to.publicCallStack[i] = fromPrivate.publicCallRequests[i]));
  return to;
}
