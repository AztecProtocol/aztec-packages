import { Fr } from '@aztec/foundation/fields';

/**
 * AVM contract call results.
 */
export class AvmContractCallResults {
  public readonly reverted: boolean;
  public readonly output: Fr[];

  public readonly revertReason: Error | undefined;

  constructor(reverted: boolean, output: Fr[], revertReason?: Error) {
    this.reverted = reverted;
    this.output = output;
    this.revertReason = revertReason;
  }

  toString(): string {
    let resultsStr = `reverted: ${this.reverted}, output: ${this.output}`;
    if (this.revertReason) {
      resultsStr += `, revertReason: ${this.revertReason}`;
    }
    return resultsStr;
  }
}
