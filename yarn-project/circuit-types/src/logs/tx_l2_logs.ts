import { type LogHash, type ScopedLogHash } from '@aztec/circuits.js/kernel';
import { MAX_CONTRACT_CLASS_LOGS_PER_TX } from '@aztec/constants';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, prefixBufferWithLength } from '@aztec/foundation/serialize';

import isEqual from 'lodash.isequal';
import { z } from 'zod';

import { UnencryptedFunctionL2Logs } from './function_l2_logs.js';
import { type UnencryptedL2Log } from './unencrypted_l2_log.js';

/**
 * Data container of logs emitted in 1 tx.
 * TODO(#8945): Currently only used for contract class logs. When these are fields, delete this class.
 */
export abstract class TxL2Logs {
  abstract hash(): Buffer;

  constructor(
    /** An array containing logs emitted in individual function invocations in this tx. */
    public readonly functionLogs: UnencryptedFunctionL2Logs[],
  ) {}

  /**
   * Serializes logs into a buffer.
   * @returns A buffer containing the serialized logs.
   */
  public toBuffer(): Buffer {
    const serializedFunctionLogs = this.functionLogs.map(logs => logs.toBuffer());
    // Concatenate all serialized function logs into a single buffer and prefix it with 4 bytes for its total length.
    return prefixBufferWithLength(Buffer.concat(serializedFunctionLogs));
  }

  /**
   * Get the total length of serialized data.
   * @returns Total length of serialized data.
   */
  public getSerializedLength(): number {
    return this.functionLogs.reduce((acc, logs) => acc + logs.getSerializedLength(), 0) + 4;
  }

  /**
   * Get the total length of all chargable data (raw log data + 4 for each log)
   * TODO: Rename this? getChargableLength? getDALength?
   * @returns Total length of data.
   */
  public getKernelLength(): number {
    return this.functionLogs.reduce((acc, logs) => acc + logs.getKernelLength(), 0);
  }

  /** Gets the total number of logs. */
  public getTotalLogCount() {
    return this.functionLogs.reduce((acc, logs) => acc + logs.logs.length, 0);
  }

  /**
   * Adds function logs to the existing logs.
   * @param functionLogs - The function logs to add
   * @remarks Used by sequencer to append unencrypted logs emitted in public function calls.
   */
  public addFunctionLogs(functionLogs: UnencryptedFunctionL2Logs[]) {
    this.functionLogs.push(...functionLogs);
  }

  /**
   * Unrolls logs from this tx.
   * @returns Unrolled logs.
   */
  public unrollLogs(): UnencryptedL2Log[] {
    return this.functionLogs.flatMap(functionLog => functionLog.logs);
  }

  /**
   * Checks if two TxL2Logs objects are equal.
   * @param other - Another TxL2Logs object to compare with.
   * @returns True if the two objects are equal, false otherwise.
   */
  public equals(other: TxL2Logs): boolean {
    return isEqual(this, other);
  }

  /**
   * Filter the logs from functions from this TxL2Logs that
   * appear in the provided logHashes
   * @param logHashes hashes we want to keep
   * @param output our aggregation
   * @returns our aggregation
   */
  public filter(logHashes: LogHash[], output: TxL2Logs): TxL2Logs {
    for (const fnLogs of this.functionLogs) {
      let include = false;
      for (const log of fnLogs.logs) {
        if (logHashes.findIndex(lh => lh.value.equals(Fr.fromBuffer(log.getSiloedHash()))) !== -1) {
          include = true;
        }
      }
      if (include) {
        output.addFunctionLogs([fnLogs]);
      }
    }
    return output;
  }

  /**
   * Filter the logs from functions from this TxL2Logs that
   * appear in the provided scopedLogHashes
   * @param logHashes hashes we want to keep
   * @param output our aggregation
   * @returns our aggregation
   */
  public filterScoped(scopedLogHashes: ScopedLogHash[], output: TxL2Logs): TxL2Logs {
    for (const fnLogs of this.functionLogs) {
      let include = false;
      for (const log of fnLogs.logs) {
        let contractAddress: any;
        if ('contractAddress' in log) {
          contractAddress = log.contractAddress;
        } else {
          throw new Error("Can't run filterScoped in logs without contractAddress or maskedContractAddress");
        }
        if (
          scopedLogHashes.findIndex(
            slh => slh.contractAddress.equals(contractAddress) && slh.value.equals(Fr.fromBuffer(log.hash())),
          ) != -1
        ) {
          include = true;
        }
      }
      if (include) {
        output.addFunctionLogs([fnLogs]);
      }
    }
    return output;
  }
}

export class ContractClassTxL2Logs extends TxL2Logs {
  static get schema() {
    return z
      .object({ functionLogs: z.array(UnencryptedFunctionL2Logs.schema) })
      .transform(({ functionLogs }) => new ContractClassTxL2Logs(functionLogs));
  }

  /** Creates an empty instance. */
  public static empty() {
    return new ContractClassTxL2Logs([]);
  }

  /**
   * Deserializes logs from a buffer.
   * @param buf - The buffer containing the serialized logs.
   * @param isLengthPrefixed - Whether the buffer is prefixed with 4 bytes for its total length.
   * @returns A new L2Logs object.
   */
  public static fromBuffer(buf: Buffer | BufferReader, isLengthPrefixed = true): ContractClassTxL2Logs {
    const reader = BufferReader.asReader(buf);

    // If the buffer is length prefixed use the length to read the array. Otherwise, the entire buffer is consumed.
    const logsBufLength = isLengthPrefixed ? reader.readNumber() : -1;
    const serializedFunctionLogs = reader.readBufferArray(logsBufLength);

    const functionLogs = serializedFunctionLogs.map(logs => UnencryptedFunctionL2Logs.fromBuffer(logs, false));
    return new ContractClassTxL2Logs(functionLogs);
  }

  /**
   * Creates a new `TxL2Logs` object with `numCalls` function logs and `numLogsPerCall` logs in each invocation.
   * @param numCalls - The number of function calls in the tx.
   * @param numLogsPerCall - The number of logs emitted in each function call.
   * @returns A new `TxL2Logs` object.
   */
  public static async random(numCalls: number, numLogsPerCall: number): Promise<ContractClassTxL2Logs> {
    if (numCalls * numLogsPerCall > MAX_CONTRACT_CLASS_LOGS_PER_TX) {
      throw new Error(
        `Trying to create ${numCalls * numLogsPerCall} logs for one tx (max: ${MAX_CONTRACT_CLASS_LOGS_PER_TX})`,
      );
    }
    const functionLogs: UnencryptedFunctionL2Logs[] = [];
    for (let i = 0; i < numCalls; i++) {
      functionLogs.push(await UnencryptedFunctionL2Logs.random(numLogsPerCall));
    }
    return new ContractClassTxL2Logs(functionLogs);
  }

  /**
   * @param logs - Logs to be hashed.
   * @returns The hash of the logs.
   * Note: This is a TS implementation of `computeKernelUnencryptedLogsHash` function in Decoder.sol. See that function documentation
   *       for more details.
   */
  public override hash(): Buffer {
    const unrolledLogs = this.unrollLogs();
    return ContractClassTxL2Logs.hashSiloedLogs(unrolledLogs.map(log => log.getSiloedHash()));
  }

  /**
   * Hashes siloed contract class logs as in the same way as the base rollup would.
   * @param siloedLogHashes - The siloed log hashes
   * @returns The hash of the logs.
   */
  public static hashSiloedLogs(siloedLogHashes: Buffer[]): Buffer {
    if (siloedLogHashes.length == 0) {
      return Buffer.alloc(32);
    }

    let allSiloedLogHashes = Buffer.alloc(0);
    for (const siloedLogHash of siloedLogHashes) {
      allSiloedLogHashes = Buffer.concat([allSiloedLogHashes, siloedLogHash]);
    }
    // pad the end of logs with 0s
    for (let i = 0; i < MAX_CONTRACT_CLASS_LOGS_PER_TX - siloedLogHashes.length; i++) {
      allSiloedLogHashes = Buffer.concat([allSiloedLogHashes, Buffer.alloc(32)]);
    }

    return sha256Trunc(allSiloedLogHashes);
  }
}
