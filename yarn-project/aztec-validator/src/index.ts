export * from "./validator.js";

// Create a validator client based on the node config
import { AztecValidator } from "./validator.js";

// A validator is really just a glorified signer at this point
export function createValidator(signingKey: string): AztecValidator {
   return new AztecValidator(signingKey) ;
}
