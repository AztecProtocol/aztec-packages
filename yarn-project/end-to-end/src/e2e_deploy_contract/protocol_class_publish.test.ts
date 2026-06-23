import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { publishContractClass } from '@aztec/aztec.js/deployment';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import type { Wallet } from '@aztec/aztec.js/wallet';
import { BundledProtocolContractsProvider } from '@aztec/protocol-contracts/providers/bundle';
import { getContractClassFromArtifact } from '@aztec/stdlib/contract';

import { jest } from '@jest/globals';

import { AUTOMINE_E2E_OPTS, DUPLICATE_NULLIFIER_ERROR } from '../fixtures/fixtures.js';
import { DeployTest } from './deploy_test.js';

// Regression test for A-1257. The world-state genesis seeds the protocol contract registration nullifiers (the siloed
// class-id nullifiers that ContractClassRegistry.publish would emit for each bundled protocol class). With those
// present at genesis, an on-chain re-publish of a bundled protocol class id pushes an already-existing nullifier, so the
// transaction is invalid (duplicate nullifier) and never reaches the archiver — which previously would throw on the
// block-0 preload key collision and stall L1 sync.
describe('e2e_deploy_contract publish protocol contract class', () => {
  jest.setTimeout(900_000);

  const t = new DeployTest('protocol class publish');

  let logger: Logger;
  let wallet: Wallet;
  let defaultAccountAddress: AztecAddress;
  let aztecNode: AztecNode;

  beforeAll(async () => {
    ({ logger, wallet, aztecNode, defaultAccountAddress } = await t.setup({ ...AUTOMINE_E2E_OPTS }));
  });

  afterAll(() => t.teardown());

  it('rejects re-publishing a bundled protocol contract class as a duplicate nullifier', async () => {
    // FeeJuice is a bundled protocol contract whose class is preloaded by the archiver at block 0 and whose class-id
    // registration nullifier is now seeded at genesis. Publishing it via the normal class-registration path recomputes
    // the same class id and pushes the same siloed nullifier, which already exists.
    const provider = new BundledProtocolContractsProvider();
    const { artifact } = await provider.getProtocolContractArtifact('FeeJuice');

    const contractClass = await getContractClassFromArtifact(artifact);
    // Sanity check: the node already knows this class from its block-0 preload, confirming we are re-publishing an
    // already-present protocol class rather than a fresh one.
    expect(await aztecNode.getContractClass(contractClass.id)).toBeDefined();

    logger.info(`Attempting to re-publish bundled protocol class ${contractClass.id.toString()}`);
    const interaction = await publishContractClass(wallet, artifact);

    await expect(interaction.send({ from: defaultAccountAddress })).rejects.toThrow(DUPLICATE_NULLIFIER_ERROR);
  });

  // The protocol contract *instance* deployment cannot be tested the same way. ContractInstanceRegistry's
  // `publish_for_public_execution` emits the *derived* contract address as the nullifier
  // (AztecAddress::compute(public_keys, partial_address) — see contract_instance_registry_contract/src/main.nr), not the
  // magic protocol address (1/2/3). The instance nullifiers seeded at genesis use those magic addresses, which no
  // deployment can produce: there is no set of deployment parameters that hashes to a magic address, and no transaction
  // can spoof one as msg_sender. So the seeded magic-address instance nullifier is unreachable on-chain and there is no
  // duplicate-nullifier failure to trigger. Seeding it is harmless (it matches the canonical protocol deployment) but
  // untestable via a publish, so we deliberately do not write an instance-publish case here.
});
