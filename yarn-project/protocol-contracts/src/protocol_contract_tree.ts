import type { PROTOCOL_CONTRACT_TREE_HEIGHT } from '@aztec/constants';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import type { IndexedMerkleTree } from '@aztec/foundation/trees';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ProtocolContractLeafPreimage } from '@aztec/stdlib/trees';

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

// Computed address can be different from contract address due to upgrades
export async function getProtocolContractLeafAndMembershipWitness(
  contractAddress: AztecAddress,
  computedAddress: AztecAddress,
) {
  const tree = await getTree();
  let lowLeaf;
  let witness;
  if (isProtocolContract(contractAddress)) {
    const index = contractAddress.toField().toNumber();
    lowLeaf = tree.leafPreimages[index];
    witness = tree.getMembershipWitness(index);
  } else {
    lowLeaf = tree.getLowLeaf(computedAddress.toBigInt());
    const hashed = (await poseidon2Hash(lowLeaf.toHashInputs())).toBuffer();
    witness = tree.getMembershipWitness(hashed);
  }
  return { lowLeaf, witness };
}
