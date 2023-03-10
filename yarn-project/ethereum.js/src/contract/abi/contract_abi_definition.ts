export type AbiDataTypes = 'uint256' | 'boolean' | 'string' | 'bytes' | string;

export type AbiInput = {
  components?: any;
  name: string;
  type: AbiDataTypes;
  indexed?: boolean;
  internalType?: string;
};

export type AbiOutput = {
  components?: any;
  name: string;
  type: AbiDataTypes;
  internalType?: string;
};

export interface ContractEntryDefinition {
  constant?: boolean;
  payable?: boolean;
  anonymous?: boolean;
  inputs?: AbiInput[];
  name?: string;
  outputs?: AbiOutput[];
  type: 'function' | 'constructor' | 'event' | 'fallback' | 'error';
  stateMutability?: 'pure' | 'view' | 'payable' | 'nonpayable';
  signature?: string;
  gas?: number;
}

export type ContractAbiDefinition = ContractEntryDefinition[];
