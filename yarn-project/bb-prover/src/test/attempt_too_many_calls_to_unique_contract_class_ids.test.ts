import { Fr } from '@aztec/foundation/fields';
import { MockedAvmTestContractDataSource } from '@aztec/simulator/public/fixtures';

import { proveAndVerifyAvmTestContractSimple } from './prove_and_verify.js';

const TIMEOUT = 300_000;

it(
  'attempt too many calls to unique contract class ids',
  async () => {
    const contractDataSource = new MockedAvmTestContractDataSource();
    // args is initialized to MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS+1 contract addresses with unique class IDs
    // should fail because we are trying to call MAX+1 unique class IDs
    const args = Array.from(contractDataSource.contractInstances.values()).map(instance => instance.address.toField());
    // Push an empty one (just padding to match function calldata size)
    args.push(new Fr(0));
    await proveAndVerifyAvmTestContractSimple(
      /*checkCircuitOnly=*/ true, // quick
      'nested_call_to_add_n_times_different_addresses',
      args,
      /*expectRevert=*/ true,
      /*skipContractDeployments=*/ false,
      contractDataSource,
    );
  },
  TIMEOUT,
);
