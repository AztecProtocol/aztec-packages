import {
  NestedProcessReturnValues,
  PublicSimulationOutput,
  SimulationError,
  Tx,
  TxSimulationResult,
} from '@aztec/circuit-types';
import { AztecAddress, Fr, GasSettings } from '@aztec/circuits.js';
import { ContractArtifact, FunctionAbi } from '@aztec/foundation/abi';
import { ContractInstanceWithAddress } from '@aztec/types/contracts';

import { SentTx } from '../contract/sent_tx.js';
import { FeePaymentMethod } from '../fee/fee_payment_method.js';

export class TxExecutionRequestBuilder {}

export type TxExecutionRequestAdapter = (builder: TxExecutionRequestBuilder, userRequest: UserRequest) => Promise<void>;

export interface TxExecutionRequestComponent {
  adaptTxExecutionRequest: TxExecutionRequestAdapter;
}

export interface InstanceDeploymentParams {
  constructorName: string;
  constructorArgs: any;
  salt: Fr;
  publicKeysHash: Fr;
  deployer: AztecAddress;
}

export interface DeploymentOptions {
  registerClass?: boolean;
  publicDeploy?: boolean;
}

export interface UserFunctionCall {
  contractInstance: ContractInstanceWithAddress;
  functionName: string;
  args: any;
  deploymentOptions?: DeploymentOptions;
  contractArtifact?: ContractArtifact;
  functionAbi?: FunctionAbi;
}

export interface UserRequest {
  calls: UserFunctionCall[];
  gasSettings: GasSettings;
  paymentMethod: FeePaymentMethod;
  from: AztecAddress;
  simulatePublicFunctions?: boolean;
}
