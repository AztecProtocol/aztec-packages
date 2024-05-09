import { CombinedAccumulatedData, CombinedConstantData, Fr, Gas } from '@aztec/circuits.js';
import { mapValues } from '@aztec/foundation/collection';

import { EncryptedTxL2Logs, UnencryptedTxL2Logs } from '../logs/index.js';
import { type SimulationError } from '../simulation_error.js';
import { PublicKernelType } from './processed_tx.js';
import { Tx } from './tx.js';

/** Return values of simulating a circuit. */
export type ProcessReturnValues = Fr[] | undefined;

export class ProcessOutput {
  constructor(
    public encryptedLogs: EncryptedTxL2Logs,
    public unencryptedLogs: UnencryptedTxL2Logs,
    public revertReason: SimulationError | undefined,
    public constants: CombinedConstantData,
    public end: CombinedAccumulatedData,
    public publicReturnValues: ProcessReturnValues,
    public gasUsed: Partial<Record<PublicKernelType, Gas>>,
  ) {}

  toJSON() {
    return {
      encryptedLogs: this.encryptedLogs.toJSON(),
      unencryptedLogs: this.unencryptedLogs.toJSON(),
      revertReason: this.revertReason,
      constants: this.constants.toBuffer().toString('hex'),
      end: this.end.toBuffer().toString('hex'),
      publicReturnValues: this.publicReturnValues?.map(fr => fr.toString()),
      gasUsed: mapValues(this.gasUsed, gas => gas?.toJSON()),
    };
  }

  static fromJSON(json: any): ProcessOutput {
    return new ProcessOutput(
      EncryptedTxL2Logs.fromJSON(json.encryptedLogs),
      UnencryptedTxL2Logs.fromJSON(json.unencryptedLogs),
      json.revertReason,
      CombinedConstantData.fromBuffer(Buffer.from(json.constants, 'hex')),
      CombinedAccumulatedData.fromBuffer(Buffer.from(json.end, 'hex')),
      json.publicReturnValues?.map(Fr.fromString),
      mapValues(json.gasUsed, gas => (gas ? Gas.fromJSON(gas) : undefined)),
    );
  }
}

// REFACTOR: Review what we need to expose to the user when running a simulation.
// Eg tx already has encrypted and unencrypted logs, but those cover only the ones
// emitted during private. We need the ones from ProcessOutput to include the public
// ones as well. However, those would only be present if the user chooses to simulate
// the public side of things. This also points at this class needing to be split into
// two: one with just private simulation, and one that also includes public simulation.
export class SimulatedTx {
  constructor(public tx: Tx, public privateReturnValues?: ProcessReturnValues, public publicOutput?: ProcessOutput) {}

  /**
   * Returns suggested total and teardown gas limits for the simulated tx.
   * Note that public gas usage is only accounted for if the publicOutput is present.
   * @param pad - Percentage to pad the suggested gas limits by, defaults to 10%.
   */
  public getGasLimits(pad = 0.1) {
    const privateGasUsed = this.tx.data.publicInputs.end.gasUsed;
    if (this.publicOutput) {
      const publicGasUsed = Object.values(this.publicOutput.gasUsed).reduce(
        (total, current) => total.add(current),
        Gas.empty(),
      );
      const teardownGas = this.publicOutput.gasUsed[PublicKernelType.TEARDOWN] ?? Gas.empty();

      return {
        totalGas: privateGasUsed.add(publicGasUsed).mul(1 + pad),
        teardownGas: teardownGas.mul(1 + pad),
      };
    }

    return { totalGas: privateGasUsed.mul(1 + pad), teardownGas: Gas.empty() };
  }

  /**
   * Convert a SimulatedTx class object to a plain JSON object.
   * @returns A plain object with SimulatedTx properties.
   */
  public toJSON() {
    return {
      tx: this.tx.toJSON(),
      privateReturnValues: this.privateReturnValues?.map(fr => fr.toString()),
      publicOutput: this.publicOutput && this.publicOutput.toJSON(),
    };
  }

  /**
   * Convert a plain JSON object to a Tx class object.
   * @param obj - A plain Tx JSON object.
   * @returns A Tx class object.
   */
  public static fromJSON(obj: any) {
    const tx = Tx.fromJSON(obj.tx);
    const publicOutput = obj.publicOutput ? ProcessOutput.fromJSON(obj.publicOutput) : undefined;
    const privateReturnValues = obj.privateReturnValues?.map(Fr.fromString);

    return new SimulatedTx(tx, privateReturnValues, publicOutput);
  }
}
