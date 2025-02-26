import type { MerkleTreeCheckpointOperations } from '@aztec/stdlib/interfaces/server';

export class ForkCheckpoint {
  private completed = false;

  private constructor(private readonly fork: MerkleTreeCheckpointOperations) {}

  static async new(fork: MerkleTreeCheckpointOperations): Promise<ForkCheckpoint> {
    await fork.createCheckpoint();
    return new ForkCheckpoint(fork);
  }

  async commit(): Promise<void> {
    if (this.completed) {
      return;
    }

    await this.fork.commitCheckpoint();
    this.completed = true;
  }

  async revert(): Promise<void> {
    if (this.completed) {
      return;
    }

    await this.fork.revertCheckpoint();
    this.completed = true;
  }
}
