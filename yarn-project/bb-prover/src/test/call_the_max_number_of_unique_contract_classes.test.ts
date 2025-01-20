import { MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS } from '@aztec/circuits.js';
import { MockedAvmTestContractDataSource } from '@aztec/simulator/public/fixtures';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'call the max number of unique contract classes',
  async () => {
    const contractDataSource = new MockedAvmTestContractDataSource();
    // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS contract addresses with unique class IDs
    const args = Array.from(contractDataSource.contractInstances.values())
      .map(instance => instance.address.toField())
      .slice(0, MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS);
    // include the first contract again at the end to ensure that we can call it even after the limit is reached
    args.push(args[0]);
    // include another contract address that reuses a class ID to ensure that we can call it even after the limit is reached
    args.push(contractDataSource.instanceSameClassAsFirstContract.address.toField());
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'nested_call_to_add_n_times_different_addresses',
      args,
      /*expectRevert=*/ false,
      /*skipContractDeployments=*/ false,
      contractDataSource,
    );
  },
  TIMEOUT,
);
