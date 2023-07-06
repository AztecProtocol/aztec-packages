import { Fr, GlobalVariables, TwoFieldHash } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';

/**
 * Reads values from L1 state that is used for the global values.
 */
export interface L1GlobalReader {
  getLastTimestamp(): Promise<bigint>;
  getVersion(): Promise<bigint>;
  getChainId(): Promise<bigint>;
  getLastEthBlockHash(): Promise<Buffer>;
}

/**
 * Builds global variables from L1 state.
 */
export interface GlobalVariableBuilder {
  buildGlobalVariables(blockNumber: Fr): Promise<GlobalVariables>;
}

/**
 * Simple implementation of a builder that uses the minimum time possible for the global variables.
 */
export class SimpleGlobalVariableBuilder implements GlobalVariableBuilder {
  private log = createDebugLogger('aztec:sequencer:simple_global_variable_builder');
  constructor(private readonly reader: L1GlobalReader) {}

  private async getLastEthBlockHash(blockNumber: Fr): Promise<TwoFieldHash> {
    // In the case where this is the genesis block, we expect previous eth block hash to be 0.
    // block hash of the last block.
    if (blockNumber.value == 1n) {
      // first aztec block number is 1
      return TwoFieldHash.empty();
    }
    const blockHash = await this.reader.getLastEthBlockHash();
    return TwoFieldHash.from32ByteHash(blockHash);
  }

  /**
   * Simple builder of global variables that use the minimum time possible.
   * @param blockNumber - The block number to build global variables for.
   * @returns The global variables for the given block number.
   */
  public async buildGlobalVariables(blockNumber: Fr): Promise<GlobalVariables> {
    const lastTimestamp = new Fr(await this.reader.getLastTimestamp());
    const version = new Fr(await this.reader.getVersion());
    const chainId = new Fr(await this.reader.getChainId());
    const ethBlockHash = await this.getLastEthBlockHash(blockNumber);
    console.log('GOT THE GLOBAL THING');

    this.log(
      `Built global variables for block ${blockNumber}: (${chainId}, ${version}, ${blockNumber}, ${lastTimestamp}, ${ethBlockHash})`,
    );

    return new GlobalVariables(chainId, version, blockNumber, lastTimestamp, ethBlockHash);
  }
}
