import type { Fr } from '@aztec/foundation/curves/bn254';
import { PrivateExecutionOracle } from '@aztec/pxe/simulator';
import type { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * TXE-specific subclass of PrivateExecutionOracle that forbids operations not supported in
 * TestEnvironment::private_context. TXE uses dedicated oracle flows (e.g. private_call) instead.
 */
export class TXEPrivateExecutionOracle extends PrivateExecutionOracle {
  override callPrivateFunction(
    _targetContractAddress: AztecAddress,
    _functionSelector: FunctionSelector,
    _argsHash: Fr,
    _sideEffectCounter: number,
    _isStaticCall: boolean,
  ): Promise<{ endSideEffectCounter: Fr; returnsHash: Fr }> {
    throw new Error(
      'Contract calls are forbidden inside a `TestEnvironment::private_context`, use `private_call` instead',
    );
  }

  override assertValidPublicCalldata(_calldataHash: Fr): Promise<void> {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }

  override notifyRevertiblePhaseStart(_minRevertibleSideEffectCounter: number): Promise<void> {
    throw new Error('Enqueueing public calls is not supported in TestEnvironment::private_context');
  }
}
