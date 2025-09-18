export { AuthWitness } from '@aztec/stdlib/auth-witness';
export {
  SetPublicAuthwitContractInteraction,
  type ContractFunctionInteractionCallIntent,
  getMessageHashFromIntent,
  computeAuthWitMessageHash,
  computeInnerAuthWitHashFromAction,
  lookupValidity,
  type CallIntent,
  type IntentInnerHash,
} from '../utils/authwit.js';
export { computeInnerAuthWitHash } from '@aztec/stdlib/auth-witness';

export { CallAuthorizationRequest } from '../authorization/call_authorization_request.js';
