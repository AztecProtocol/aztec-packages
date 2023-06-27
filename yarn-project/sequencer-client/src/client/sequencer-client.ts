import { P2P } from '@aztec/p2p';
import { WorldStateSynchroniser } from '@aztec/world-state';

import { ContractDataSource, L1ToL2MessageSource, L2BlockSource } from '@aztec/types';
import { SoloBlockBuilder } from '../block_builder/solo_block_builder.js';
import { SequencerClientConfig } from '../config.js';
import { getL1Publisher, getVerificationKeys, Sequencer } from '../index.js';
import { EmptyRollupProver } from '../prover/empty.js';
import { PublicProcessorFactory } from '../sequencer/public_processor.js';
import { WasmRollupCircuitSimulator } from '../simulator/rollup.js';
import { Fr } from '@aztec/circuits.js';

/**
 * Encapsulates the full sequencer and publisher.
 */
export class SequencerClient {
  constructor(private sequencer: Sequencer) {}

  /**
   * Initializes and starts a new instance.
   * @param config - Configuration for the sequencer, publisher, and L1 tx sender.
   * @param p2pClient - P2P client that provides the txs to be sequenced.
   * @param worldStateSynchroniser - Provides access to world state.
   * @param contractDataSource - Provides access to contract bytecode for public executions.
   * @param l2BlockSource - Provides information about the previously published blocks.
   * @param l1ToL2MessageSource - Provides access to L1 to L2 messages.
   * @returns A new running instance.
   */
  public static async new(
    config: SequencerClientConfig,
    p2pClient: P2P,
    worldStateSynchroniser: WorldStateSynchroniser,
    contractDataSource: ContractDataSource,
    l2BlockSource: L2BlockSource,
    l1ToL2MessageSource: L1ToL2MessageSource,
  ) {
    const publisher = getL1Publisher(config);
    const merkleTreeDb = worldStateSynchroniser.getLatest();

    const blockBuilder = new SoloBlockBuilder(
      merkleTreeDb,
      getVerificationKeys(),
      await WasmRollupCircuitSimulator.new(),
      new EmptyRollupProver(),
      new Fr(config.chainId),
      new Fr(config.version),
    );

    const publicProcessorFactory = new PublicProcessorFactory(merkleTreeDb, contractDataSource, l1ToL2MessageSource);

    const sequencer = new Sequencer(
      publisher,
      p2pClient,
      worldStateSynchroniser,
      blockBuilder,
      l2BlockSource,
      l1ToL2MessageSource,
      publicProcessorFactory,
      config,
    );

    await sequencer.start();
    return new SequencerClient(sequencer);
  }

  /**
   * Stops the sequencer from processing new txs.
   */
  public async stop() {
    await this.sequencer.stop();
  }

  /**
   * Restarts the sequencer after being stopped.
   */
  public restart() {
    this.sequencer.restart();
  }
}
