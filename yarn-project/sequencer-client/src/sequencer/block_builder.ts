import {
  AccumulatedData,
  BaseRollupInputs,
  ConstantBaseRollupData,
  ConstantData,
  ContractDeploymentData,
  Fr,
  OldTreeRoots,
  PreviousKernelData,
  PrivateKernelPublicInputs,
  TxContext,
  VerificationKey,
  VK_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { MerkleTreeDb, MerkleTreeId } from '@aztec/merkle-tree';
import { Tx } from '@aztec/p2p';

const TODO_FR = new Fr(0);
const TODO_NUM = 0;
const TODO: any = Buffer.alloc(0);

export class BlockBuilder {
  constructor(private db: MerkleTreeDb) {}

  public async buildBlock(tx: Tx) {}

  private async getTreeRoot(id: MerkleTreeId): Promise<Fr> {
    return new Fr(await this.db.getTreeInfo(id).then(t => t.root));
  }

  private async getCurrentTreeRoots() {
    return await Promise.all([
      this.getTreeRoot(MerkleTreeId.NULLIFIER_TREE),
      this.getTreeRoot(MerkleTreeId.CONTRACT_TREE),
    ]);
  }

  private async getTxContext(tx: Tx) {
    if (tx.data.end.newContracts.length !== 1) {
      throw new Error(`Only txs that deploy exactly one contract are supported for now`);
    }
    const [newContract] = tx.data.end.newContracts;

    return new TxContext(
      false, // isFeePayment
      false, // isRebatePayment
      true, // isContractDeployment
      new ContractDeploymentData(
        TODO_FR, // TODO: constructorVkHash
        newContract.functionTreeRoot,
        TODO_FR, // TODO: contractAddressSalt
        newContract.portalContractAddress,
      ),
    );
  }

  private async getKernelDataFor(tx: Tx) {
    return new PreviousKernelData(
      tx.data,
      TODO, // TODO: proof, isn't this the tx.data.end.aggregationObject?,
      TODO, // TODO: vk
      TODO_NUM, // TODO: vkIndex
      Array(VK_TREE_HEIGHT).fill(TODO_FR), // TODO: vkSiblingPath
    );
  }

  private async getConstantBaseRollupData(): Promise<ConstantBaseRollupData> {
    throw new Error('Unimplemented');
  }

  private async getBaseRollupInputsFor(tx: Tx) {
    return BaseRollupInputs.from({
      proverId: TODO_FR,
      constants: await this.getConstantBaseRollupData(),
    } as any); // TODO: Carry on...
  }
}
