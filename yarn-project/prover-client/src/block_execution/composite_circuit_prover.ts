import type { ServerCircuitProver } from '@aztec/stdlib/interfaces/server';

/**
 * `ServerCircuitProver` that composes a "base" prover for circuit-proving methods
 * with an execution prover for `executeBlock`. Used so a single `ProvingAgent`
 * can take any kind of job from the broker — proving jobs route to the base
 * prover, `BLOCK_EXECUTION` jobs route to the execution handler.
 *
 * Every method other than `executeBlock` delegates to the base prover. If the
 * caller does not provide an execution prover, `executeBlock` falls back to the
 * base prover (which rejects).
 */
export class CompositeServerCircuitProver implements ServerCircuitProver {
  constructor(
    private readonly base: ServerCircuitProver,
    private readonly execution: ServerCircuitProver = base,
  ) {}

  // --- Proving methods: delegate to base ---
  public getBaseParityProof: ServerCircuitProver['getBaseParityProof'] = (...args) =>
    this.base.getBaseParityProof(...args);
  public getRootParityProof: ServerCircuitProver['getRootParityProof'] = (...args) =>
    this.base.getRootParityProof(...args);
  public getPublicChonkVerifierProof: ServerCircuitProver['getPublicChonkVerifierProof'] = (...args) =>
    this.base.getPublicChonkVerifierProof(...args);
  public getPrivateTxBaseRollupProof: ServerCircuitProver['getPrivateTxBaseRollupProof'] = (...args) =>
    this.base.getPrivateTxBaseRollupProof(...args);
  public getPublicTxBaseRollupProof: ServerCircuitProver['getPublicTxBaseRollupProof'] = (...args) =>
    this.base.getPublicTxBaseRollupProof(...args);
  public getTxMergeRollupProof: ServerCircuitProver['getTxMergeRollupProof'] = (...args) =>
    this.base.getTxMergeRollupProof(...args);
  public getBlockRootFirstRollupProof: ServerCircuitProver['getBlockRootFirstRollupProof'] = (...args) =>
    this.base.getBlockRootFirstRollupProof(...args);
  public getBlockRootSingleTxFirstRollupProof: ServerCircuitProver['getBlockRootSingleTxFirstRollupProof'] = (
    ...args
  ) => this.base.getBlockRootSingleTxFirstRollupProof(...args);
  public getBlockRootEmptyTxFirstRollupProof: ServerCircuitProver['getBlockRootEmptyTxFirstRollupProof'] = (...args) =>
    this.base.getBlockRootEmptyTxFirstRollupProof(...args);
  public getBlockRootRollupProof: ServerCircuitProver['getBlockRootRollupProof'] = (...args) =>
    this.base.getBlockRootRollupProof(...args);
  public getBlockRootSingleTxRollupProof: ServerCircuitProver['getBlockRootSingleTxRollupProof'] = (...args) =>
    this.base.getBlockRootSingleTxRollupProof(...args);
  public getBlockMergeRollupProof: ServerCircuitProver['getBlockMergeRollupProof'] = (...args) =>
    this.base.getBlockMergeRollupProof(...args);
  public getCheckpointRootRollupProof: ServerCircuitProver['getCheckpointRootRollupProof'] = (...args) =>
    this.base.getCheckpointRootRollupProof(...args);
  public getCheckpointRootSingleBlockRollupProof: ServerCircuitProver['getCheckpointRootSingleBlockRollupProof'] = (
    ...args
  ) => this.base.getCheckpointRootSingleBlockRollupProof(...args);
  public getCheckpointPaddingRollupProof: ServerCircuitProver['getCheckpointPaddingRollupProof'] = (...args) =>
    this.base.getCheckpointPaddingRollupProof(...args);
  public getCheckpointMergeRollupProof: ServerCircuitProver['getCheckpointMergeRollupProof'] = (...args) =>
    this.base.getCheckpointMergeRollupProof(...args);
  public getRootRollupProof: ServerCircuitProver['getRootRollupProof'] = (...args) =>
    this.base.getRootRollupProof(...args);
  public getAvmProof: ServerCircuitProver['getAvmProof'] = (...args) => this.base.getAvmProof(...args);

  // --- Block execution: delegate to execution prover ---
  public executeBlock: ServerCircuitProver['executeBlock'] = (...args) => this.execution.executeBlock(...args);
}
