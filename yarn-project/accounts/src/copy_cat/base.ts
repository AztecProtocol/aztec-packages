import {
  type AccountInterface,
  AccountWalletWithSecretKey,
  type ContractArtifact,
  Fr,
  type PXE,
  TxExecutionRequest,
} from '@aztec/aztec.js';
import type { CompleteAddress, ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { SimulationOverrides, TxSimulationResult } from '@aztec/stdlib/tx';

/**
 * An AccountWallet that copies the address of another account, and then
 * uses the simulation overrides feature to execute different contract code under
 * the copied address. This is used to bypass authwit verification entirely
 * (`is_valid` always returns `true`)
 */
export abstract class CopyCatAccountWalletBase extends AccountWalletWithSecretKey {
  constructor(
    pxe: PXE,
    account: AccountInterface,
    private originalAddress: CompleteAddress,
    private artifact: ContractArtifact,
    private instance: ContractInstanceWithAddress,
  ) {
    super(pxe, account, Fr.ZERO, Fr.ZERO);
  }

  override getCompleteAddress(): CompleteAddress {
    return this.originalAddress;
  }

  override simulateTx(
    txRequest: TxExecutionRequest,
    simulatePublic: boolean,
    _skipTxValidation?: boolean,
    _skipFeeEnforcement?: boolean,
    _overrides?: SimulationOverrides,
  ): Promise<TxSimulationResult> {
    const contractOverrides = {
      [this.originalAddress.address.toString()]: { instance: this.instance, artifact: this.artifact },
    };
    return this.pxe.simulateTx(txRequest, simulatePublic, true, true, {
      contracts: contractOverrides,
    });
  }
}
