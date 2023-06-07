import { createDebugLogger } from "@aztec/foundation/log";
import { PublicContractsDB, PublicStateDB } from "./db.js";
import { DBOracle } from "../index.js";


// TODO(Maddiaa): give this import a more permanent location.
import { ExecutionContext } from "../context.js";
import { PrivateHistoricTreeRoots } from "@aztec/circuits.js";



/** 
 * The execution context for a public transaction simulation.
 */
export class PublicTxExecutionContext extends ExecutionContext {
    constructor(
        /** The public state database */
        public readonly publicStateDb: PublicStateDB,
        /** The contracts state database. */
        public readonly contractsDb: PublicContractsDB,
        /** The commitment trees database. */
        public readonly privateDb: DBOracle,
        /** The tree roots of current execution. */
        public historicRoots: PrivateHistoricTreeRoots,

        private log = createDebugLogger("aztec:simulator:public-execution-context")
    ) {
        super(privateDb, historicRoots)
    }



}