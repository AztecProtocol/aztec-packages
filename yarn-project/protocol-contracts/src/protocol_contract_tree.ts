import {
  type AztecAddress,
  type IndexedMerkleTree,
  type PROTOCOL_CONTRACT_TREE_HEIGHT,
  type ProtocolContractLeafPreimage,
} from '@aztec/circuits.js';
import { poseidon2Hash } from '@aztec/foundation/crypto';

import { buildProtocolContractTree } from './build_protocol_contract_tree.js';
import { isProtocolContract } from './protocol_contract.js';
import { ProtocolContractAddress, ProtocolContractLeaves, protocolContractNames } from './protocol_contract_data.js';

let protocolContractTree:
  | IndexedMerkleTree<ProtocolContractLeafPreimage, typeof PROTOCOL_CONTRACT_TREE_HEIGHT>
  | undefined;

async function getTree() {
  if (!protocolContractTree) {
    const leaves = protocolContractNames.map(name => ({
      address: ProtocolContractAddress[name],
      leaf: ProtocolContractLeaves[name],
    }));
    protocolContractTree = await buildProtocolContractTree(leaves);
  }
  return protocolContractTree;
}

export async function getProtocolContractLeafAndMembershipWitness(address: AztecAddress) {
  const tree = await getTree();
  let lowLeaf;
  let witness;
  if (isProtocolContract(address)) {
    const index = address.toField().toNumber();
    lowLeaf = tree.leafPreimages[index];
    witness = tree.getMembershipWitness(index);
  } else {
    lowLeaf = tree.getLowLeaf(address.toBigInt());
    const hashed = (await poseidon2Hash(lowLeaf.toHashInputs())).toBuffer();
    witness = tree.getMembershipWitness(hashed);
  }
  return { lowLeaf, witness };
}
