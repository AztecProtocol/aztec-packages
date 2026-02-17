import type { FunctionCall } from '../abi/function_call.js';
import type { AuthWitness } from '../auth_witness/auth_witness.js';
import { AztecAddress } from '../aztec-address/index.js';
import type { Capsule } from './capsule.js';
import type { HashedValues } from './hashed_values.js';

/**
 * Represents data necessary to perform an action in the network successfully.
 * This class can be considered Aztec's "minimal execution unit".
 * */
export class ExecutionPayload {
  public constructor(
    /** The function calls to be executed. */
    public calls: FunctionCall[],
    /** Any transient auth witnesses needed for this execution */
    public authWitnesses: AuthWitness[],
    /** Data passed through an oracle for this execution. */
    public capsules: Capsule[],
    /** Extra hashed values to be injected in the execution cache */
    public extraHashedArgs: HashedValues[] = [],
    /**
     * The address that is paying for the fee in this execution payload (if any).
     * If undefined, the wallet software executing the payload will have to add a fee payment method
     */
    public feePayer?: AztecAddress,
  ) {}

  static empty() {
    return new ExecutionPayload([], [], [], [], undefined);
  }
}

/**
 * Merges an array ExecutionPayloads combining their calls, authWitnesses, capsules and extraArgHashes.
 * @throws Error if multiple payloads have different fee payers set
 */
export function mergeExecutionPayloads(requests: ExecutionPayload[]): ExecutionPayload {
  const calls = requests.map(r => r.calls).flat();
  const combinedAuthWitnesses = requests.map(r => r.authWitnesses ?? []).flat();
  const combinedCapsules = requests.map(r => r.capsules ?? []).flat();
  const combinedExtraHashedArgs = requests.map(r => r.extraHashedArgs ?? []).flat();

  // Collect unique fee payers
  const uniqueFeePayers = new Set(
    requests
      .map(r => r.feePayer)
      .filter((fp): fp is AztecAddress => fp !== undefined)
      .map(fp => fp.toString()),
  );

  if (uniqueFeePayers.size > 1) {
    throw new Error(
      `Cannot merge execution payloads with different fee payers. Found: ${Array.from(uniqueFeePayers).join(', ')}`,
    );
  }

  const feePayer = uniqueFeePayers.size === 1 ? AztecAddress.fromString(Array.from(uniqueFeePayers)[0]) : undefined;

  return new ExecutionPayload(calls, combinedAuthWitnesses, combinedCapsules, combinedExtraHashedArgs, feePayer);
}
