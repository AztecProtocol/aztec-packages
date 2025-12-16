import { FunctionCall } from '@aztec/stdlib/abi';
import type { AuthWitness } from '@aztec/stdlib/auth-witness';
import { Capsule, HashedValues } from '@aztec/stdlib/tx';

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
  ) {}

  static empty() {
    return new ExecutionPayload([], [], []);
  }
}

/**
 * Merges an array ExecutionPayloads combining their calls, authWitnesses, capsules and extraArgHashes.
 */
export function mergeExecutionPayloads(requests: ExecutionPayload[]): ExecutionPayload {
  const calls = requests.map(r => r.calls).flat();
  const combinedAuthWitnesses = requests.map(r => r.authWitnesses ?? []).flat();
  const combinedCapsules = requests.map(r => r.capsules ?? []).flat();
  const combinedextraHashedArgs = requests.map(r => r.extraHashedArgs ?? []).flat();
  return new ExecutionPayload(calls, combinedAuthWitnesses, combinedCapsules, combinedextraHashedArgs);
}
