import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
import { updateInlineTestData } from '@aztec/foundation/testing/files';
import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type ContractClass,
  type ContractInstance,
  computeContractAddressFromInstance,
  computeContractClassId,
  computeContractClassIdPreimage,
  computeInitializationHashFromEncodedArgs,
  computePartialAddress,
  computePrivateFunctionsTree,
  computeSaltedInitializationHash,
} from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

describe('Data generation for noir tests', () => {
  setupCustomSnapshotSerializers(expect);

  type FixtureContractData = Omit<ContractClass, 'version' | 'publicFunctions'> &
    Pick<ContractInstance, 'publicKeys' | 'salt'> &
    Pick<ContractClass, 'privateFunctions'> & { toString: () => string };

  const defaultContract: FixtureContractData = {
    artifactHash: new Fr(12345),
    packedBytecode: Buffer.from([3, 4, 5, 6, 7]),
    publicKeys: PublicKeys.default(),
    salt: new Fr(56789),
    privateFunctions: [
      { selector: FunctionSelector.fromField(new Fr(1010101)), vkHash: new Fr(123123) },
      { selector: FunctionSelector.fromField(new Fr(2020202)), vkHash: new Fr(456456) },
    ],
    toString: () => 'defaultContract',
  };

  const parentContract: FixtureContractData = {
    artifactHash: new Fr(1212),
    packedBytecode: Buffer.from([3, 4, 3, 4]),
    publicKeys: PublicKeys.default(),
    salt: new Fr(5656),
    privateFunctions: [{ selector: FunctionSelector.fromField(new Fr(334455)), vkHash: new Fr(789789) }],
    toString: () => 'parentContract',
  };

  const constructorSelector = new FunctionSelector(999);

  const contracts: [FixtureContractData, string][] = [
    [defaultContract, 'default'],
    [parentContract, 'parent'],
  ];

  const format = (obj: Record<string, string>, indent = 4) =>
    `{\n${Object.entries(obj)
      .map(([key, value]) => `${' '.repeat(indent)}${key}: ${value}`)
      .join(',\n')}\n}`;

  test.each(contracts)('Computes contract info for %s', async (contract, namePrefix) => {
    const contractClass: ContractClass = { ...contract, version: 1 };
    const contractClassId = await computeContractClassId(contractClass);
    const initializationHash = await computeInitializationHashFromEncodedArgs(constructorSelector, []);
    const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment } =
      await computeContractClassIdPreimage(contractClass);
    const deployer = AztecAddress.ZERO;
    const instance: ContractInstance = {
      ...contract,
      version: 1,
      initializationHash,
      currentContractClassId: contractClassId,
      originalContractClassId: contractClassId,
      deployer,
    };
    const address = await computeContractAddressFromInstance(instance);
    const saltedInitializationHash = await computeSaltedInitializationHash(instance);
    const partialAddress = await computePartialAddress(instance);

    const contractData = {
      /* eslint-disable camelcase */
      contract_address_salt: contract.salt.toString(),
      artifact_hash: artifactHash.toString(),
      public_bytecode_commitment: publicBytecodeCommitment.toString(),
      private_functions_root: privateFunctionsRoot.toString(),
      address: `AztecAddress { inner: ${address.toString()} }`,
      partial_address: `PartialAddress { inner: ${partialAddress.toString()} }`,
      contract_class_id: `ContractClassId { inner: ${contractClassId.toString()} }`,
      public_keys: `PublicKeys { inner: ${contract.publicKeys.toString()} }`,
      salted_initialization_hash: `SaltedInitializationHash { inner: ${saltedInitializationHash.toString()} }`,
      deployer: `AztecAddress { inner: ${deployer.toString()} }`,
      /* eslint-enable camelcase */
    };

    expect(contractData).toMatchSnapshot();

    // Use the default PublicKeys defined in noir. It should be the same as the default value defined in ts.
    // eslint-disable-next-line camelcase
    contractData.public_keys = 'PublicKeys::default()';

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/tests/fixtures/contracts.nr',
      `${namePrefix}_contract`,
      `ContractData ${format(contractData)}`,
    );
  });

  it('Computes function tree for the private functions', async () => {
    const [contract, namePrefix] = contracts[0];
    const tree = await computePrivateFunctionsTree(contract.privateFunctions);

    const index = 0;
    const targetFunction = contract.privateFunctions[index];
    const siblingPath = tree.getSiblingPath(index);
    const functionData = {
      /* eslint-disable camelcase */
      data: `FunctionData { selector: FunctionSelector { inner: ${targetFunction.selector} }, is_private: true }`,
      vk_hash: targetFunction.vkHash.toString(),
      membership_witness: `MembershipWitness {
        leaf_index: ${index},
        sibling_path: [\n${siblingPath.map(b => `0x${b.toString('hex')}`).join(',\n')}\n],
    }`,
      /* eslint-enable camelcase */
    };

    expect(functionData).toMatchSnapshot();

    // Run with AZTEC_GENERATE_TEST_DATA=1 to update noir test data.
    updateInlineTestData(
      'noir-projects/noir-protocol-circuits/crates/types/src/tests/fixtures/contract_functions.nr',
      `${namePrefix}_private_function`,
      `ContractFunction ${format(functionData)}`,
    );
  });
});
