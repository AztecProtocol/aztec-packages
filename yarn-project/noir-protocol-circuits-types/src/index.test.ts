import {
  EthAddress,
  Point,
  PrivateKernelInitCircuitPrivateInputs,
  PrivateKernelInnerCircuitPrivateInputs,
  PrivateKernelTailCircuitPrivateInputs,
  computeContractAddressFromInstance,
  computeContractAddressFromPartial,
  computePublicKeysHash,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { times } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { fileURLToPath } from '@aztec/foundation/url';

import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';

import { executeInit, executeInner, executeTail } from './index.js';

describe('Private kernel', () => {
  let logger: DebugLogger;

  beforeAll(() => {
    logger = createDebugLogger('noir-private-kernel');
  });

  // Taken from e2e_nested_contract => performs nested calls => first init (corresponds to deployment)
  // To regenerate fixture data run the following on the yarn-project/e2e folder
  // AZTEC_GENERATE_TEST_DATA=1 yarn test e2e_nested_contract -t 'performs nested calls'
  // TODO(@spalladino) Re-enable this test
  it.skip('Executes private kernel init circuit for a contract deployment', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const filepath = resolve(dirname(fileURLToPath(import.meta.url)), './fixtures/nested-call-private-kernel-init.hex');
    const serialized = Buffer.from(readFileSync(filepath).toString(), 'hex');
    const kernelInputs = PrivateKernelInitCircuitPrivateInputs.fromBuffer(serialized);

    // We check that the test data is for a contract deployment
    expect(kernelInputs.txRequest.txContext.isContractDeploymentTx).toBe(true);

    const kernelOutputs = await executeInit(kernelInputs);

    expect(kernelOutputs).toMatchSnapshot();
  });

  // Taken from e2e_nested_contract => performs nested calls => last inner
  // To regenerate fixture data run the following on the yarn-project/e2e folder
  // AZTEC_GENERATE_TEST_DATA=1 yarn test e2e_nested_contract -t 'performs nested calls'
  it('Executes private kernel inner for a nested call', async () => {
    logger('Initialized Noir instance with private kernel init circuit');

    const filepath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      './fixtures/nested-call-private-kernel-inner.hex',
    );
    const serialized = Buffer.from(readFileSync(filepath).toString(), 'hex');
    const kernelInputs = PrivateKernelInnerCircuitPrivateInputs.fromBuffer(serialized);

    const kernelOutputs = await executeInner(kernelInputs);

    expect(kernelOutputs).toMatchSnapshot();
  });

  // Taken from e2e_nested_contract => performs nested calls => first ordering
  // To regenerate fixture data run the following on the yarn-project/e2e folder
  // AZTEC_GENERATE_TEST_DATA=1 yarn test e2e_nested_contract -t 'performs nested calls'
  it('Executes private kernel ordering after a deployment', async () => {
    const filepath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      './fixtures/nested-call-private-kernel-ordering.hex',
    );
    const serialized = Buffer.from(readFileSync(filepath).toString(), 'hex');
    const kernelInputs = PrivateKernelTailCircuitPrivateInputs.fromBuffer(serialized);

    const kernelOutputs = await executeTail(kernelInputs);

    expect(kernelOutputs).toMatchSnapshot();
  });
});

// TODO(benesjan): move the following to relevant class tests
describe('Noir compatibility tests (interop_testing.nr)', () => {
  // Tests in this file are to check that what we are computing in Noir
  // is equivalent to what we were computing in circuits.js/the typescript implementation
  // This is to ensure that we have not introduced any bugs in the transition from circuits.js to Noir

  it('Address matches Noir', () => {
    const publicKey = new Point(new Fr(1n), new Fr(2n));
    const salt = new Fr(3n);
    const contractClassId = new Fr(4n);
    const initializationHash = new Fr(5n);
    const portalContractAddress = EthAddress.fromField(new Fr(6n));

    const address = computeContractAddressFromInstance({
      publicKeysHash: computePublicKeysHash(publicKey),
      salt,
      contractClassId,
      initializationHash,
      portalContractAddress,
      version: 1,
    });

    expect(address.toString()).toMatchSnapshot();
  });

  it('Public key hash matches Noir', () => {
    const publicKey = new Point(new Fr(1n), new Fr(2n));
    expect(computePublicKeysHash(publicKey).toString()).toMatchSnapshot();
  });

  it('Address from partial matches Noir', () => {
    const publicKey = new Point(new Fr(1n), new Fr(2n));
    const partialAddress = new Fr(3n);
    const address = computeContractAddressFromPartial({ publicKey, partialAddress });
    expect(address.toString()).toMatchSnapshot();
  });

  it('Var args hash matches noir', () => {
    const args = times(800, i => new Fr(i));
    const res = computeVarArgsHash(args);
    expect(res).toMatchSnapshot();
  });
});
