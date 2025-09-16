import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import type { Fr } from '@aztec/foundation/fields';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress, ContractInstantiationData } from '@aztec/stdlib/contract';
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

import type { Contract } from '../contract/contract.js';
import type { ContractFunctionInteraction } from '../contract/contract_function_interaction.js';
import type {
  ProfileMethodOptions,
  SendMethodOptions,
  SimulateMethodOptions,
} from '../contract/interaction_options.js';
import type { IntentAction, IntentInnerHash } from '../utils/authwit.js';

/**
 * A wrapper type that allows any item to be associated with an alias.
 */
export type Aliased<T> = {
  /**
   * The alias
   */
  alias: string;
  /**
   * The item being aliased.
   */
  item: T;
};

/**
 * A reduced representation of a Contract, only including its instance and artifact
 */
export type ContractInstanceAndArtifact = Pick<Contract, 'artifact' | 'instance'>;

/**
 * The wallet interface.
 */
export type Wallet = Pick<
  PXE,
  'getContractClassMetadata' | 'getContractMetadata' | 'getTxReceipt' | 'getPrivateEvents' | 'getPublicEvents'
> & {
  registerSender(address: AztecAddress, alias?: string): Promise<AztecAddress>;
  getSenders(): Promise<Aliased<AztecAddress>[]>;
  getAccounts(): Promise<Aliased<AztecAddress>[]>;
  registerContract(
    instanceData: AztecAddress | ContractInstanceWithAddress | ContractInstantiationData | ContractInstanceAndArtifact,
    artifact?: ContractArtifact,
  ): Promise<ContractInstanceWithAddress>;
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
