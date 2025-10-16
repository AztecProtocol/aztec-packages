/**
 * Re-exports of authorization and authentication witness utilities.
 *
 * This module provides types and functions for managing authorization witnesses (authwits),
 * which are used to delegate permissions and authorize actions on behalf of accounts
 * in the Aztec protocol.
 *
 * @module api/authorization
 */

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