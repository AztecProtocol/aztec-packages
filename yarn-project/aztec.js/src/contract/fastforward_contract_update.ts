import { Fr } from '@aztec/foundation/curves/bn254';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  DelayedPublicMutableValuesWithHash,
  ScheduledDelayChange,
  ScheduledValueChange,
} from '@aztec/stdlib/delayed-public-mutable';
import type { AztecNode, StateOverrides } from '@aztec/stdlib/interfaces/client';

/**
 * Builds `StateOverrides` that simulate a contract instance having already been upgraded to a new contract class.
 *
 * Mirrors a real on-chain upgrade flow (`pxe.updateContract` followed by waiting out the delay): the contract
 * instance's `currentContractClassId` is bumped to `newClassId`, and the `ContractInstanceRegistry`'s delayed
 * public mutable storage is rewritten to look like the upgrade was scheduled in the past.
 *
 * The new class must already be registered on chain. To upgrade to an unregistered class, register it first
 * (or use a higher-level helper that bundles class registration with the upgrade).
 *
 * @param args.instanceAddress - Address of the deployed instance to upgrade.
 * @param args.newClassId - ID of the (already-registered) class to upgrade to.
 * @param args.node - Node used to fetch the existing instance and validate the class is registered.
 * @returns `StateOverrides` to spread into a `simulate({ stateOverrides })` call.
 * @throws If the instance is not deployed, the class is not registered, or the instance is already on the target class.
 */
export async function fastForwardContractUpdate(args: {
  instanceAddress: AztecAddress;
  newClassId: Fr;
  node: AztecNode;
}): Promise<StateOverrides> {
  const { instanceAddress, newClassId, node } = args;

  const instance = await node.getContract(instanceAddress);
  if (!instance) {
    throw new Error(`Instance not deployed at ${instanceAddress}; deploy it before fast-forwarding an update`);
  }

  const klass = await node.getContractClass(newClassId);
  if (!klass) {
    throw new Error(`Contract class ${newClassId} is not registered; register it before fast-forwarding to it`);
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

  const upgradedInstance = { ...instance, currentContractClassId: newClassId };

  return {
    publicStorage,
    contractInstances: [upgradedInstance],
  };
}
