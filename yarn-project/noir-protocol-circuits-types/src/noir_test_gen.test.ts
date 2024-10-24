import {
  AztecAddress,
  type ContractClass,
  type ContractInstance,
  FunctionSelector,
  PublicKeys,
  computeContractAddressFromInstance,
  computeContractClassId,
  computeContractClassIdPreimage,
  computeInitializationHashFromEncodedArgs,
  computePartialAddress,
  computePrivateFunctionsTree,
  computeSaltedInitializationHash,
} from '@aztec/circuits.js';
import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';

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
      { selector: FunctionSelector.fromField(new Fr(1010101)), vkHash: new Fr(0) },
      { selector: FunctionSelector.fromField(new Fr(2020202)), vkHash: new Fr(0) },
    ],
    toString: () => 'defaultContract',
  };

  const parentContract: FixtureContractData = {
    artifactHash: new Fr(1212),
    packedBytecode: Buffer.from([3, 4, 3, 4]),
    publicKeys: PublicKeys.default(),
    salt: new Fr(5656),
    privateFunctions: [{ selector: FunctionSelector.fromField(new Fr(334455)), vkHash: new Fr(0) }],
    toString: () => 'parentContract',
  };

  const constructorSelector = new FunctionSelector(999);

  const contracts = [[defaultContract], [parentContract]];

  const format = (obj: object) => JSON.stringify(obj, null, 2).replaceAll('"', '');

  test.each(contracts)('Computes contract info for %s', contract => {
    const contractClass: ContractClass = { ...contract, publicFunctions: [], version: 1 };
    const contractClassId = computeContractClassId(contractClass);
    const initializationHash = computeInitializationHashFromEncodedArgs(constructorSelector, []);
    const { artifactHash, privateFunctionsRoot, publicBytecodeCommitment } =
      computeContractClassIdPreimage(contractClass);
    const deployer = AztecAddress.ZERO;
    const instance: ContractInstance = { ...contract, version: 1, initializationHash, contractClassId, deployer };
    const address = computeContractAddressFromInstance(instance);
    const saltedInitializationHash = computeSaltedInitializationHash(instance);
    const partialAddress = computePartialAddress(instance);

    /* eslint-disable camelcase */
    expect(
      format({
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
      }),
    ).toMatchSnapshot();
    /* eslint-enable camelcase */
  });

  test.each(contracts)('Computes function tree for %s', contract => {
    const tree = computePrivateFunctionsTree(contract.privateFunctions);
    expect(
      tree.leaves.map((leaf, index) => ({
        index,
        leaf: leaf.toString('hex'),
        siblingPath: tree.getSiblingPath(index).map(b => b.toString('hex')),
      })),
    ).toMatchSnapshot();
  });
});
