import type { MerkleTreeCheckpointOperations } from '@aztec/stdlib/interfaces/server';

export class ForkCheckpoint {
  private completed = false;

  private constructor(
    private readonly fork: MerkleTreeCheckpointOperations,
    public readonly depth: number,
  ) {}

  static async new(fork: MerkleTreeCheckpointOperations): Promise<ForkCheckpoint> {
    const depth = await fork.createCheckpoint();
    return new ForkCheckpoint(fork, depth);
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

  /**
   * Reverts all checkpoints at or above this checkpoint's depth (inclusive),
   * destroying this checkpoint and any nested checkpoints created on top of it,
   * while preserving any checkpoints created by callers below our depth.
   */
  async revertToCheckpoint(): Promise<void> {
    if (this.completed) {
      return;
    }

    await this.fork.revertAllCheckpointsTo(this.depth);
    this.completed = true;
  }
}
