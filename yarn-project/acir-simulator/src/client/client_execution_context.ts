import { TxExecutionRequest } from "@aztec/types";
import { DBOracle } from "./db_oracle.js";
import { PrivateHistoricTreeRoots } from "@aztec/circuits.js";
import { ExecutionContext } from "../context.js";

/**
 * The execution context for a client tx simulation.
 */
export class ClientTxExecutionContext extends ExecutionContext {
  constructor(
    /**  The database oracle. */
    public db: DBOracle,
    /** The tx request. */
    // TODO(Maddiaa): might not need this.
    public request: TxExecutionRequest,
    /** The old roots. */
    public historicRoots: PrivateHistoricTreeRoots,
  ) {
    super(
      db,
      historicRoots
    )
  }


}
