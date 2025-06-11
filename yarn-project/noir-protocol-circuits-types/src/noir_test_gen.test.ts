import { CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { setupCustomSnapshotSerializers } from '@aztec/foundation/testing';
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
import { hashVK } from '@aztec/stdlib/hash';
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

  test.each(contracts)('Computes contract info for %s', async contract => {
    const defaultVkHash = await hashVK(new Array(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS).fill(Fr.ZERO));
    contract.privateFunctions.forEach(p => (p.vkHash = defaultVkHash));
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

  test.each(contracts)('Computes function tree for %s', async contract => {
    const tree = await computePrivateFunctionsTree(contract.privateFunctions);
    expect(
      tree.leaves.map((leaf, index) => ({
        index,
        leaf: leaf.toString('hex'),
        siblingPath: tree.getSiblingPath(index).map(b => b.toString('hex')),
      })),
    ).toMatchSnapshot();
  });
});
