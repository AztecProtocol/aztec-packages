import { default as levelup } from 'levelup';
import { default as memdown } from 'memdown';
import { L2BlockSource, Archiver } from '@aztec/archiver';
import { P2P, P2PCLient } from '@aztec/p2p';
import { MerkleTrees, WorldStateSynchroniser, ServerWorldStateSynchroniser } from '@aztec/world-state';
import { EthAddress } from '@aztec/ethereum.js/eth_address';

/**
 * The public client.
 */
export class AztecNode {
  private p2pClient?: P2P;
  private blockSource?: L2BlockSource;
  private merkleTreeDB?: MerkleTrees;
  private worldStateSynchroniser?: WorldStateSynchroniser;

  constructor() {}

  /**
   * Initialises the Aztec Node, wait for component to sync.
   * @param rpcUrl - The URL of an Ethereum RPC node.
   * @param rollupAddress - The rollup contract address.
   * @param yeeterAddress - The yeeter contract address.
   */
  public async init(rpcUrl: string, rollupAddress: EthAddress, yeeterAddress: EthAddress) {
    // first configure the block source
    this.blockSource = Archiver.new(rpcUrl, rollupAddress, yeeterAddress);

    await this.blockSource.start();

    // give the block source to the P2P network and the world state synchroniser
    this.p2pClient = new P2PCLient(this.blockSource);
    const db = levelup(memdown.MemDown());
    this.merkleTreeDB = new MerkleTrees(db);
    this.worldStateSynchroniser = new ServerWorldStateSynchroniser(this.merkleTreeDB, this.blockSource);

    // start both and wait for them to sync from the block source
    const p2pSyncPromise = this.p2pClient.start();
    const worldStateSyncPromise = this.worldStateSynchroniser.start();
    await Promise.all([p2pSyncPromise, worldStateSyncPromise]);

    // create and start the sequencer
    // new Sequencer(this.blockSource, this.p2pClient, this.merkleTreeDB, this.publisher);
  }
}
