import { type Fr, type Logger, type PXE, type Wallet, getContractClassFromArtifact } from '@aztec/aztec.js';
import { registerContractClass } from '@aztec/aztec.js/deployment';
import { computeContractClassId } from '@aztec/circuits.js';
import { UpdatableContract, UpdatableContractArtifact } from '@aztec/noir-contracts.js/Updatable';
import { UpdatedContract, UpdatedContractArtifact } from '@aztec/noir-contracts.js/Updated';

import { setup } from './fixtures/utils.js';

describe('e2e_contract_updates', () => {
  let wallet: Wallet;
  let teardown: () => Promise<void>;
  let contract: UpdatableContract;
  let updatedContractClassId: Fr;
  let logger: Logger;

  beforeAll(async () => {
    ({ teardown, wallet, logger } = await setup());
    contract = await UpdatableContract.deploy(wallet, 1n).send().deployed();
    const registerMethod = await registerContractClass(wallet, UpdatedContractArtifact);
    await registerMethod.send().wait();

    updatedContractClassId = getContractClassFromArtifact(UpdatedContractArtifact).id;
  });

  afterAll(() => teardown());

  it('should update the contract', async () => {
    expect(await contract.methods.get_private_value().simulate()).toEqual(1n);
    expect(await contract.methods.get_public_value().simulate()).toEqual(1n);
    await contract.methods.update_to(updatedContractClassId).send().wait();
    // Mine some blocks
    logger.info('Waiting for update to apply');
    for (let i = 0; i < 12; i++) {
      await contract.methods.set_public_value(1n).send().wait();
    }
    logger.info('Done waiting');

    const updatedContract = await UpdatedContract.at(contract.address, wallet);
    // Call a private method that wasn't available in the previous contract
    await updatedContract.methods.set_private_value().send().wait();
    // Read state that was changed by the previous tx
    expect(await updatedContract.methods.get_private_value().simulate()).toEqual(27n);

    // Call a public method with a new implementation
    await updatedContract.methods.set_public_value().send().wait();
    expect(await updatedContract.methods.get_public_value().simulate()).toEqual(27n);
  });
});
