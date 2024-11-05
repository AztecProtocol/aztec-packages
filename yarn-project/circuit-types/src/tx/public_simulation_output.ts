import { CombinedAccumulatedData, CombinedConstantData, Fr, Gas } from '@aztec/circuits.js';
import { mapValues } from '@aztec/foundation/collection';

import { EncryptedTxL2Logs, UnencryptedTxL2Logs } from '../logs/tx_l2_logs.js';
import { type FailingFunction, type NoirCallStack, SimulationError } from '../simulation_error.js';
import { type PublicKernelPhase } from './processed_tx.js';

/** Return values of simulating a circuit. */
export type ProcessReturnValues = Fr[] | undefined;

/** Return values of simulating complete callstack. */
export class NestedProcessReturnValues {
  values: ProcessReturnValues;
  nested: NestedProcessReturnValues[];

  constructor(values: ProcessReturnValues, nested?: NestedProcessReturnValues[]) {
    this.values = values;
    this.nested = nested ?? [];
  }

  toJSON(): any {
    return {
      values: this.values?.map(fr => fr.toString()),
      nested: this.nested.map(n => n.toJSON()),
    };
  }

  static fromJSON(json: any): NestedProcessReturnValues {
    return new NestedProcessReturnValues(
      json.values?.map(Fr.fromString),
      json.nested?.map((n: any) => NestedProcessReturnValues.fromJSON(n)),
    );
  }

  static empty() {
    return new NestedProcessReturnValues([]);
  }
}

/**
 * A simulation error for the AVM.
 * This error includes the revert data returned from the top level function.
 */
export class AvmSimulationError extends SimulationError {
  constructor(
    originalMessage: string,
    functionErrorStack: FailingFunction[],
    public revertData: Fr[],
    noirErrorStack?: NoirCallStack,
    options?: ErrorOptions,
  ) {
    super(originalMessage, functionErrorStack, noirErrorStack, options);
  }

  override toJSON() {
    return {
      ...super.toJSON(),
      revertData: this.revertData.map(fr => fr.toString()),
    };
  }

  static override fromJSON(obj: ReturnType<AvmSimulationError['toJSON']>) {
    return new AvmSimulationError(
      obj.originalMessage,
      obj.functionErrorStack,
      obj.revertData.map(serializedFr => Fr.fromString(serializedFr)),
      obj.noirErrorStack,
    );
  }
}

/**
 * Outputs of processing the public component of a transaction.
 */
export class PublicSimulationOutput {
  constructor(
    public encryptedLogs: EncryptedTxL2Logs,
    public unencryptedLogs: UnencryptedTxL2Logs,
    public revertReason: AvmSimulationError | undefined,
    public constants: CombinedConstantData,
    public end: CombinedAccumulatedData,
    public publicReturnValues: NestedProcessReturnValues[],
    public gasUsed: Partial<Record<PublicKernelPhase, Gas>>,
  ) {}

  toJSON() {
    return {
      encryptedLogs: this.encryptedLogs.toJSON(),
      unencryptedLogs: this.unencryptedLogs.toJSON(),
      revertReason: this.revertReason,
      constants: this.constants.toBuffer().toString('hex'),
      end: this.end.toBuffer().toString('hex'),
      publicReturnValues: this.publicReturnValues.map(returns => returns?.toJSON()),
      gasUsed: mapValues(this.gasUsed, gas => gas?.toJSON()),
    };
  }

  static fromJSON(json: any): PublicSimulationOutput {
    return new PublicSimulationOutput(
      EncryptedTxL2Logs.fromJSON(json.encryptedLogs),
      UnencryptedTxL2Logs.fromJSON(json.unencryptedLogs),
      json.revertReason,
      CombinedConstantData.fromBuffer(Buffer.from(json.constants, 'hex')),
      CombinedAccumulatedData.fromBuffer(Buffer.from(json.end, 'hex')),
      Array.isArray(json.publicReturnValues)
        ? json.publicReturnValues.map((returns: any) => NestedProcessReturnValues.fromJSON(returns))
        : [],
      mapValues(json.gasUsed, gas => (gas ? Gas.fromJSON(gas) : undefined)),
    );
  }
}
