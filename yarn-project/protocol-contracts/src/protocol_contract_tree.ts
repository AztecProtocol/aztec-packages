import { type AztecAddress, Fr, type MerkleTree, PROTOCOL_CONTRACT_TREE_HEIGHT } from '@aztec/circuits.js';
import { assertLength } from '@aztec/foundation/serialize';

import { buildProtocolContractTree } from './build_protocol_contract_tree.js';
import { ProtocolContractAddress, ProtocolContractLeaf, protocolContractNames } from './protocol_contract_data.js';

let protocolContractTree: MerkleTree | undefined;

function getTree() {
  if (!protocolContractTree) {
    const leaves = protocolContractNames.map(name => ({
      address: ProtocolContractAddress[name],
      leaf: ProtocolContractLeaf[name],
    }));
    protocolContractTree = buildProtocolContractTree(leaves);
  }
  return protocolContractTree;
}

export function getProtocolContractSiblingPath(address: AztecAddress) {
  const tree = getTree();
  const index = address.toField().toNumber();
  return assertLength<Fr, typeof PROTOCOL_CONTRACT_TREE_HEIGHT>(
    tree.getSiblingPath(index).map(buf => new Fr(buf)),
    PROTOCOL_CONTRACT_TREE_HEIGHT,
  );
}
