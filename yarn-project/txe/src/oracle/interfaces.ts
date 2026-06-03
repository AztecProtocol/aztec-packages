import type { HandlersForPrefix } from '@aztec/pxe/simulator';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { TXE_ORACLE_REGISTRY } from './txe_oracle_registry.js';

/**
 * Oracle methods associated with the execution of an Aztec #[external("public")] function.
 *
 * Note that real contracts have their Brillig calls to these be transpiled into opcodes, the oracles are only executed
 * as such when running the original Brillig code, e.g. when invoking functions that interact with a PublicContext
 * directly in a Noir test.
 */
export type IAvmExecutionOracle = HandlersForPrefix<typeof TXE_ORACLE_REGISTRY, 'avm'> & { isAvm: true };

/**
 * Oracle methods associated with the execution of an Aztec Noir test. Methods that dispatch to the session state
 * handler (context switches, call context) are excluded from this interface.
 */
type TxeStateOracles =
  | 'assertCompatibleOracleVersion'
  | 'setTopLevelTXEContext'
  | 'setPrivateTXEContext'
  | 'setPublicTXEContext'
  | 'setUtilityTXEContext'
  | 'getLastCallOffchainEffects'
  | 'getLastCallContext';

export type ITxeExecutionOracle = Omit<HandlersForPrefix<typeof TXE_ORACLE_REGISTRY, 'txe'>, TxeStateOracles> & {
  isTxe: true;
  // TODO(F-335): Drop this from here as it's not a real oracle handler - it's only called from
  // RPCTranslator::txeGetPrivateEvents and never from Noir.
  syncContractNonOracleMethod(contractAddress: AztecAddress, scope: AztecAddress, jobId: string): Promise<void>;
};
