import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import {
  DelayedPublicMutableValuesWithHash,
  ScheduledDelayChange,
  ScheduledValueChange,
} from '@aztec/stdlib/delayed-public-mutable';
import type { AztecNode, StateOverrides } from '@aztec/stdlib/interfaces/client';

/**
 * Builds the override blobs that simulate a contract instance having already been upgraded to a new contract class.
 *
 * Mirrors a real on-chain upgrade flow (`pxe.updateContract` followed by waiting out the delay). Returns:
 *
 * - `stateOverrides` — node-side state-tree writes that rewrite the `ContractInstanceRegistry`'s delayed-public-mutable
 *   storage to look like the upgrade was scheduled in the past.
 * - `contractOverrides` — an instance entry whose `currentContractClassId` is bumped to the new class.
 *
 * The new class must already be registered on chain.
 *
 * @param args.instanceAddress - Address of the deployed instance to upgrade.
 * @param args.newClassId - ID of the (already-registered) class to upgrade to.
 * @param args.node - Node used to fetch the existing instance and validate the class is registered.
 * @returns `{ stateOverrides, contractOverrides }` to spread into a `simulate(...)` call.
 * @throws If the instance is not deployed, the class is not registered on chain, or the instance is already on the target class.
 */
export async function fastForwardContractUpdate(args: {
  instanceAddress: AztecAddress;
  newClassId: Fr;
  node: AztecNode;
}): Promise<{ stateOverrides: StateOverrides; contractOverrides: ContractInstanceWithAddress[] }> {
  const { instanceAddress, newClassId, node } = args;

  const instance = await node.getContract(instanceAddress);
  if (!instance) {
    throw new Error(`Instance not deployed at ${instanceAddress}; deploy it before fast-forwarding an update`);
  }

  const klass = await node.getContractClass(newClassId);
  if (!klass) {
    throw new Error(`Contract class ${newClassId} is not registered on chain; publish it before fast-forwarding to it`);
  }

  if (instance.currentContractClassId.equals(newClassId)) {
    throw new Error(`Instance ${instanceAddress} is already on class ${newClassId}; nothing to fast-forward`);
  }

  // Build the SVC the same way `ContractInstanceRegistry::update` would have, but with a timestamp_of_change
  // safely in the past so the AVM's UpdateCheck resolves to the post-upgrade class id at any sim timestamp.
  // `pre = 0` is the canonical "first upgrade" form: the C++ check falls back to `originalContractClassId`.
  const svc = new ScheduledValueChange([new Fr(0)], [newClassId], 1n);
  const sdc = ScheduledDelayChange.empty();
  const dpmv = new DelayedPublicMutableValuesWithHash(svc, sdc);

  const { delayedPublicMutableSlot } = await DelayedPublicMutableValuesWithHash.getContractUpdateSlots(instanceAddress);
  const fields = await dpmv.toFields();

  const publicStorage = fields.map((value, i) => ({
    contract: ProtocolContractAddress.ContractInstanceRegistry,
    slot: delayedPublicMutableSlot.add(new Fr(i)),
    value,
  }));

  const upgradedInstance: ContractInstanceWithAddress = { ...instance, currentContractClassId: newClassId };

  return {
    stateOverrides: { publicStorage },
    contractOverrides: [upgradedInstance],
  };
}
