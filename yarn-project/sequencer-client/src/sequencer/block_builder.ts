import {
  RootRollupPublicInputs,
  AggregationObject,
  AffineElement,
  Field,
  KERNEL_NEW_COMMITMENTS_LENGTH,
  KERNEL_NEW_NULLIFIERS_LENGTH,
  KERNAL_NEW_CONTRACTS_LENGTH,
} from '@aztec/circuits.js';
import { MerkleTreeDb, MerkleTreeId } from '@aztec/merkle-tree';
import { Tx } from '@aztec/p2p';
import { L2Block, AppendOnlyTreeSnapshot, ContractData } from '@aztec/archiver';

export class BlockBuilder {
  private dataTreeLeaves: Buffer[] = [];
  private nullifierTreeLeaves: Buffer[] = [];
  private contractTreeLeaves: Buffer[] = [];
  constructor(private db: MerkleTreeDb, private nextRollupId: number, private tx: Tx) {
    this.dataTreeLeaves = Array(KERNEL_NEW_COMMITMENTS_LENGTH)
      .fill(0)
      .map((_, index) => Buffer.alloc(32, index + nextRollupId * KERNEL_NEW_COMMITMENTS_LENGTH));
    this.nullifierTreeLeaves = Array(KERNEL_NEW_NULLIFIERS_LENGTH)
      .fill(0)
      .map((_, index) => Buffer.alloc(32, index + nextRollupId * KERNEL_NEW_NULLIFIERS_LENGTH));
    this.contractTreeLeaves = Array(KERNAL_NEW_CONTRACTS_LENGTH)
      .fill(0)
      .map((_, index) => Buffer.alloc(32, index + nextRollupId * KERNAL_NEW_CONTRACTS_LENGTH));
    this.contractTreeLeaves[0] = tx.txData.newContracts[0].function_tree_root;
  }

  public async buildL2Block() {
    const startDataTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE);
    const startNullifierTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const startContractTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const startDataTreeRootsTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE_ROOTS_TREE);
    const startContractTreeRootsTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE);

    await this.updateTrees();

    const endDataTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE);
    const endNullifierTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const endContractTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
    const endDataTreeRootsTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE_ROOTS_TREE);
    const endContractTreeRootsTreeSnapshot = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE);
    const contractData = {
      aztecAddress: this.tx.txData.newContracts[0].contractAddress,
      ethAddress: this.tx.txData.newContracts[0].portalContractAddress,
    } as ContractData;
    const l2block = new L2Block(
      this.nextRollupId,
      startDataTreeSnapshot,
      endDataTreeSnapshot,
      startNullifierTreeSnapshot,
      endNullifierTreeSnapshot,
      startContractTreeSnapshot,
      endContractTreeSnapshot,
      startDataTreeRootsTreeSnapshot,
      endDataTreeRootsTreeSnapshot,
      startContractTreeRootsTreeSnapshot,
      endContractTreeRootsTreeSnapshot,
      this.dataTreeLeaves,
      this.nullifierTreeLeaves,
      this.contractTreeLeaves,
      contractData,
    );
    return l2block;
  }

  private async getTreeSnapshot(id: MerkleTreeId): Promise<AppendOnlyTreeSnapshot> {
    const treeInfo = await this.db.getTreeInfo(id);
    return new AppendOnlyTreeSnapshot(treeInfo.root, treeInfo.size);
  }

  private async updateTrees() {
    for (let i = 0; i < KERNEL_NEW_COMMITMENTS_LENGTH; i++) {
      await this.db.appendLeaves(MerkleTreeId.DATA_TREE, this.dataTreeLeaves[i]);
    }
    for (let i = 0; i < KERNEL_NEW_NULLIFIERS_LENGTH; i++) {
      await this.db.appendLeaves(MerkleTreeId.NULLIFIER_TREE, this.nullifierTreeLeaves);
    }
    for (let i = 0; i < KERNAL_NEW_CONTRACTS_LENGTH; i++) {
      await this.db.appendLeaves(MerkleTreeId.CONTRACT_TREE, this.contractTreeLeaves);
    }
    const newDataTreeInfo = await this.getTreeSnapshot(MerkleTreeId.DATA_TREE);
    const newContractsTreeInfo = await this.getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
    await this.db.appendLeaves(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE, newContractsTreeInfo.root);
    await this.db.appendLeaves(MerkleTreeId.DATA_TREE_ROOTS_TREE, newDataTreeInfo.root);
  }

  // private async getCurrentTreeRoots() {
  //   return await Promise.all([
  //     this.getTreeRoot(MerkleTreeId.NULLIFIER_TREE),
  //     this.getTreeRoot(MerkleTreeId.CONTRACT_TREE),
  //   ]);
  // }

  // private getTxContext(tx: Tx) {
  //   if (tx.data.end.newContracts.length !== 1) {
  //     throw new Error(`Only txs that deploy exactly one contract are supported for now`);
  //   }
  //   const [newContract] = tx.data.end.newContracts;

  //   return new TxContext(
  //     false, // isFeePayment
  //     false, // isRebatePayment
  //     true, // isContractDeployment
  //     new ContractDeploymentData(
  //       TODO_FR, // TODO: constructorVkHash
  //       newContract.functionTreeRoot,
  //       TODO_FR, // TODO: contractAddressSalt
  //       newContract.portalContractAddress,
  //     ),
  //   );
  // }

  // private getKernelDataFor(tx: Tx) {
  //   return new PreviousKernelData(
  //     tx.data,
  //     TODO, // TODO: proof, isn't this the tx.data.end.aggregationObject?,
  //     TODO, // TODO: vk
  //     TODO_NUM, // TODO: vkIndex
  //     Array(VK_TREE_HEIGHT).fill(TODO_FR), // TODO: vkSiblingPath
  //   );
  // }

  // private getConstantBaseRollupData(): Promise<ConstantBaseRollupData> {
  //   throw new Error('Unimplemented');
  // }

  // private async getBaseRollupInputsFor(tx: Tx) {
  //   return BaseRollupInputs.from({
  //     proverId: TODO_FR,
  //     constants: await this.getConstantBaseRollupData(),
  //   } as any); // TODO: Carry on...
  // }
}
