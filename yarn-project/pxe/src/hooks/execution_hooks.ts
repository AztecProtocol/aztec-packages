import { type AuthorizeUtilityCall, DEFAULT_AUTHORIZE_UTILITY_CALL } from './authorize_utility_call.js';

/** Extension points for intercepting and influencing contract execution behavior. */
export interface ExecutionHooks {
  /** Called when a contract attempts a cross-contract utility call. Return true to allow, false to deny. */
  authorizeUtilityCall: AuthorizeUtilityCall;
}

/** Default hooks that deny all cross-contract utility calls. */
export const DEFAULT_EXECUTION_HOOKS: ExecutionHooks = {
  authorizeUtilityCall: DEFAULT_AUTHORIZE_UTILITY_CALL,
};
