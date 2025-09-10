import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { GasSettings } from '@aztec/stdlib/gas';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import type {
  Tx,
  TxHash,
  TxProfileResult,
  TxProvingResult,
  TxSimulationResult,
  UtilitySimulationResult,
} from '@aztec/stdlib/tx';

import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';

/**
 * The wallet interface.
 */
export type Wallet = Pick<
  PXE,
  | 'getContractClassMetadata'
  | 'getContractMetadata'
  | 'registerContract'
  | 'registerContractClass'
  | 'updateContract'
  | 'registerSender'
  | 'getTxReceipt'
  | 'getPrivateEvents'
  | 'getPublicEvents'
> & {
  estimateGas(
    exec: ExecutionPayload,
    opts: Omit<SendMethodOptions, 'estimateGas'>,
  ): Promise<Pick<GasSettings, 'gasLimits' | 'teardownGasLimits'>>;
  simulateTx(exec: ExecutionPayload, opts: SimulateMethodOptions): Promise<TxSimulationResult>;
  simulateUtility(
    functionName: string,
    args: any[],
    to: AztecAddress,
    authwits?: AuthWitness[],
  ): Promise<UtilitySimulationResult>;
  profileTx(exec: ExecutionPayload, opts: ProfileMethodOptions): Promise<TxProfileResult>;
  proveTx(exec: ExecutionPayload, opts: SendMethodOptions): Promise<TxProvingResult>;
  sendTx(tx: Tx): Promise<TxHash>;
  createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
  ): Promise<AuthWitness>;
  setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | IntentAction,
    authorized: boolean,
  ): Promise<ContractFunctionInteraction>;
};
