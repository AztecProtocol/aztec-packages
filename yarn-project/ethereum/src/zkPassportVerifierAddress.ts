import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * The address of the zk passport verifier on sepolia
 * get address from: ROOT/l1-contracts/lib/circuits/src/solidity/deployments/deployment-11155111.json
 */
export const ZK_PASSPORT_VERIFIER_ADDRESS = EthAddress.fromString('0xEE9F10f38319eAE2730dBa28fB09081dB806c5E5');
