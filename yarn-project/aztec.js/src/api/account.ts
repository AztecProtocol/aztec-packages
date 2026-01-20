export {
  type Account,
  type AccountContract,
  AccountWithSecretKey,
  BaseAccount,
  type AuthorizationProvider,
  getAccountContractAddress,
  type Salt,
} from '../account/index.js';
export type { AuthWitnessProvider, ChainInfo } from '@aztec/entrypoints/interfaces';
export { ChainInfoSchema } from '@aztec/entrypoints/interfaces';

export { SignerlessAccount } from '../account/signerless_account.js';
