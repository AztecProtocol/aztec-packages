import { ContractClassLog, PrivateLog } from '@aztec/stdlib/logs';
import type { Tx } from '@aztec/stdlib/tx';

import { z } from 'zod';

/**
 * Class containing contract class logs and private logs which are both
 * relevant for contract registrations and deployments.
 */
export class ContractDeploymentData {
  constructor(
    public readonly contractClassLogs: ContractClassLog[],
    public readonly privateLogs: PrivateLog[],
  ) {}

  public getContractClassLogs(): ContractClassLog[] {
    return this.contractClassLogs;
  }

  public getPrivateLogs(): PrivateLog[] {
    return this.privateLogs;
  }

  public static from(args: { contractClassLogs: ContractClassLog[]; privateLogs: PrivateLog[] }) {
    return new ContractDeploymentData(args.contractClassLogs, args.privateLogs);
  }

  public static empty(): ContractDeploymentData {
    return new ContractDeploymentData([], []);
  }

  public static get schema() {
    return z
      .object({
        contractClassLogs: z.array(ContractClassLog.schema),
        privateLogs: z.array(PrivateLog.schema),
      })
      .transform(ContractDeploymentData.from);
  }

  /**
   * Creates a ContractDeploymentData from a plain object without Zod validation.
   * This method is optimized for performance and skips validation, making it suitable
   * for deserializing trusted data (e.g., from C++ via MessagePack).
   * @param obj - Plain object containing ContractDeploymentData fields
   * @returns A ContractDeploymentData instance
   */
  public static fromPlainObject(obj: any): ContractDeploymentData {
    if (obj instanceof ContractDeploymentData) {
      return obj;
    }
    return new ContractDeploymentData(
      obj.contractClassLogs.map((log: any) => ContractClassLog.fromPlainObject(log)),
      obj.privateLogs.map((log: any) => PrivateLog.fromPlainObject(log)),
    );
  }
}

/**
 * Class containing both revertible and non-revertible registration/deployment data.
 */
export class AllContractDeploymentData {
  constructor(
    public readonly nonRevertibleContractDeploymentData: ContractDeploymentData,
    public readonly revertibleContractDeploymentData: ContractDeploymentData,
  ) {}

  public getNonRevertibleContractDeploymentData(): ContractDeploymentData {
    return this.nonRevertibleContractDeploymentData;
  }

  public getRevertibleContractDeploymentData(): ContractDeploymentData {
    return this.revertibleContractDeploymentData;
  }

  /**
   * Extracts all contract registration/deployment data from a tx separated by revertibility.
   * This includes contract class logs and private logs.
   *
   * This method handles both private-only transactions and transactions with public calls,
   * properly splitting logs between revertible and non-revertible categories.
   * @param tx - The transaction to extract data from
   * @returns The extracted deployment data separated by revertibility
   */
  static fromTx(tx: Tx): AllContractDeploymentData {
    const hasPublicCalls = !!tx.data.forPublic;

    // Extract contract class logs from the tx
    const allClassLogs = tx.getContractClassLogs();
    let nonRevertibleClassLogs: ContractClassLog[];
    let revertibleClassLogs: ContractClassLog[];

    if (hasPublicCalls) {
      // Transactions with public calls can have both revertible and non-revertible contract class logs
      // Split the logs up here based on revertibility
      nonRevertibleClassLogs = tx.getSplitContractClassLogs(/*revertible=*/ false);
      revertibleClassLogs = tx.getSplitContractClassLogs(/*revertible=*/ true);
    } else {
      // Private-only tx: all logs are non-revertible
      nonRevertibleClassLogs = allClassLogs;
      revertibleClassLogs = [];
    }

    // Extract contract instance logs from the transaction's private logs
    let nonRevertibleInstanceLogs: PrivateLog[];
    let revertibleInstanceLogs: PrivateLog[];

    if (hasPublicCalls) {
      // Transactions with public calls can have both revertible and non-revertible contract instance logs
      // Split the logs up here based on revertibility
      nonRevertibleInstanceLogs = tx.data.forPublic!.nonRevertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty());
      revertibleInstanceLogs = tx.data.forPublic!.revertibleAccumulatedData.privateLogs.filter(l => !l.isEmpty());
    } else {
      // Private-only tx: use logs from the `forRollup` member of the tx
      // For private-only txs, all logs are non-revertible
      nonRevertibleInstanceLogs = tx.data.forRollup!.end.privateLogs.filter(l => !l.isEmpty());
      revertibleInstanceLogs = [];
    }

    return new AllContractDeploymentData(
      new ContractDeploymentData(nonRevertibleClassLogs, nonRevertibleInstanceLogs),
      new ContractDeploymentData(revertibleClassLogs, revertibleInstanceLogs),
    );
  }
}
