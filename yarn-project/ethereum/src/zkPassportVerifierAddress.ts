import { EthAddress } from '@aztec/foundation/eth-address';

/**
 * The address of the zk passport verifier on sepolia
 * get address from: ROOT/l1-contracts/lib/circuits/src/solidity/deployments/deployment-11155111.json
 */
export const ZK_PASSPORT_VERIFIER_ADDRESS = EthAddress.fromString('0x3101Bad9eA5fACadA5554844a1a88F7Fe48D4DE0');
/**
 * The default domain of the zk passport site
 */
export const ZK_PASSPORT_DOMAIN = 'testnet.aztec.network';
/**
 * The default scope of the zk passport proofs
 */
export const ZK_PASSPORT_SCOPE = 'personhood';
