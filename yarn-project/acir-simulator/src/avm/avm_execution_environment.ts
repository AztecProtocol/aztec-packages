import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';

/** - */
export class ExecutionEnvironment {
  constructor(
    /** - */
    public readonly address: AztecAddress,
    /** - */
    public readonly storageAddress: AztecAddress,
    /** - */
    public readonly origin: AztecAddress,
    /** - */
    public readonly sender: AztecAddress,
    /** - */
    public readonly portal: EthAddress,
    /** - */
    public readonly feePerL1Gas: Fr,
    /** - */
    public readonly feePerL2Gas: Fr,
    /** - */
    public readonly feePerDaGas: Fr,
    /** - */
    public readonly contractCallDepth: Fr,
    /** - */
    // globals: TODO:
    /** - */
    public readonly isStaticCall: boolean,
    /** - */
    public readonly isDelegateCall: boolean,
    /** - */
    public readonly calldata: Fr[],
  ) {}

  static empty(): ExecutionEnvironment {
    return new ExecutionEnvironment(
      AztecAddress.zero(),
      AztecAddress.zero(),
      AztecAddress.zero(),
      AztecAddress.zero(),
      EthAddress.ZERO,
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      Fr.zero(),
      false,
      false,
      [],
    );
  }
}
