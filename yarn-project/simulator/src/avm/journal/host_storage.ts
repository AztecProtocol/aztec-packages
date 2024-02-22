import { CommitmentsDB, NullifiersDB, PublicContractsDB, PublicStateDB } from '../../public/db.js';

/**
 * Host storage
 *
 * A wrapper around the node dbs
 */
export class HostAztecState {
  constructor(
    public readonly publicStateDb: PublicStateDB,
    public readonly contractsDb: PublicContractsDB,
    public readonly commitmentsDb: CommitmentsDB,
    public readonly nullifiersDb: NullifiersDB,
  ) {}
}
