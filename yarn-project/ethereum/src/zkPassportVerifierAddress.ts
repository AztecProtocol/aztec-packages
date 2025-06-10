import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * The address of the zk passport verifier on sepolia
 * get address from: ROOT/l1-contracts/lib/circuits/src/solidity/deployments/deployment-11155111.json
 */
export const ZK_PASSPORT_VERIFIER_ADDRESS = EthAddress.fromString('0xEE9F10f38319eAE2730dBa28fB09081dB806c5E5');
/**
 * The default domain of the zk passport site
 */
export const ZK_PASSPORT_SCOPE = 'testnet.aztec.network';
/**
 * The default sub-scope of the zk passport proofs
 */
export const ZK_PASSPORT_SUB_SCOPE = 'personhood';
