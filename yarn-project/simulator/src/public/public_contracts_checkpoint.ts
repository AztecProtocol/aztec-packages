import type { PublicContractsDBInterface } from './db_interfaces.js';

export class PublicContractsCheckpoint {
  private completed = false;

  private constructor(private readonly db: PublicContractsDBInterface) {}

  static new(db: PublicContractsDBInterface): PublicContractsCheckpoint {
    db.createCheckpoint();
    return new PublicContractsCheckpoint(db);
  }

  commit(): void {
    if (this.completed) {
      return;
    }

    this.db.commitCheckpoint();
    this.completed = true;
  }

  revert(): void {
    if (this.completed) {
      return;
    }

    this.db.revertCheckpoint();
    this.completed = true;
  }
}
