import { MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type ContractInstanceWithAddress, getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { Gas } from '@aztec/stdlib/gas';
import { OFFCHAIN_MESSAGE_IDENTIFIER, type OffchainEffect } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { testContractArtifact } from '../test/fixtures.js';
import type { TxSimulationResultWithAppOffset } from '../wallet/tx_simulation_result_with_app_offset.js';
import type { Wallet } from '../wallet/wallet.js';
import { Contract } from './contract.js';
import { NO_FROM } from './interaction_options.js';

describe('DeployMethod', () => {
  let wallet: MockProxy<Wallet>;
  beforeEach(() => {
    wallet = mock<Wallet>();
    wallet.getMaxTxGasLimits.mockResolvedValue(Gas.from({ daGas: MAX_TX_DA_GAS, l2Gas: MAX_PROCESSABLE_L2_GAS }));
    wallet.registerContract.mockResolvedValue({} as ContractInstanceWithAddress);
    wallet.getContractClassMetadata.mockResolvedValue({ isContractClassPubliclyRegistered: true } as any);
    wallet.getContractMetadata.mockResolvedValue({ isContractPubliclyDeployed: true } as any);
  });

  /** Builds a `TxSimulationResultWithAppOffset` mock that satisfies what `DeployMethod.simulate` reads. */
  const makeSimulateResult = (offchainEffects: OffchainEffect[] = [], anchorBlockTimestamp = 0n) => {
    const txSimResult = mock<TxSimulationResultWithAppOffset>();
    Object.defineProperty(txSimResult, 'offchainEffects', { value: offchainEffects });
    Object.defineProperty(txSimResult, 'publicInputs', {
      value: { constants: { anchorBlockHeader: { globalVariables: { timestamp: anchorBlockTimestamp } } } },
    });
    Object.defineProperty(txSimResult, 'stats', { value: {} });
    Object.defineProperty(txSimResult, 'gasUsed', { value: { totalGas: Gas.empty(), teardownGas: Gas.empty() } });
    return txSimResult;
  };

  it('should extract offchain messages with anchor block timestamp on simulate', async () => {
    const recipient = await AztecAddress.random();
    const contractAddress = await AztecAddress.random();
    const msgPayload = [Fr.random(), Fr.random()];
    const anchorBlockTimestamp = 42000n;
    const offchainEffects: OffchainEffect[] = [
      { data: [OFFCHAIN_MESSAGE_IDENTIFIER, recipient.toField(), ...msgPayload], contractAddress },
    ];
    wallet.simulateTx.mockResolvedValue(makeSimulateResult(offchainEffects, anchorBlockTimestamp));
    const deploy = Contract.deploy(wallet, testContractArtifact, []);
    const result = await deploy.simulate({ from: await AztecAddress.random() });
    expect(result.offchainMessages).toHaveLength(1);
    expect(result.offchainMessages[0]).toEqual({
      recipient,
      payload: msgPayload,
      contractAddress,
      anchorBlockTimestamp,
    });
    expect(result.offchainEffects).toEqual([]);
  });

  describe('deployer locking and address stability', () => {
    let alice: AztecAddress;
    let bob: AztecAddress;
    const salt = new Fr(0x1234n);

    beforeEach(async () => {
      alice = await AztecAddress.random();
      bob = await AztecAddress.random();
      wallet.simulateTx.mockResolvedValue(makeSimulateResult());
      wallet.sendTx.mockResolvedValue({
        txHash: { hash: 'tx-hash' },
        offchainEffects: [],
        receipt: { txHash: { hash: 'tx-hash' } },
      } as any);
    });

    /**
     * Computes the expected address for our test artifact under the given deployer/salt, using
     * the same protocol-level helper that `DeployMethod` calls internally. Tests assert against
     * this value to confirm `DeployMethod` produces the canonical address.
     */
    const expectedAddress = async (deployer: AztecAddress) =>
      (
        await getContractInstanceFromInstantiationParams(testContractArtifact, {
          constructorArgs: [],
          salt,
          deployer,
          publicKeys: undefined,
          constructorArtifact: undefined,
        })
      ).address;

    it('matches the standalone instantiation helper when locked at construction with deployer', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt, deployer: alice });
      const expected = await expectedAddress(alice);
      expect(await deploy.getAddress()).toEqual(expected);
    });

    it('matches the standalone instantiation helper when locked at construction with universalDeploy', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt, universalDeploy: true });
      const expected = await expectedAddress(AztecAddress.ZERO);
      expect(await deploy.getAddress()).toEqual(expected);
    });

    it('keeps the address stable across simulate then send when lazy-locking from `from`', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt });
      const expected = await expectedAddress(alice);
      await deploy.simulate({ from: alice });
      const afterSimulate = await deploy.getAddress();
      await deploy.send({ from: alice });
      const afterSend = await deploy.getAddress();
      expect(afterSimulate).toEqual(afterSend);
      expect(afterSimulate).toEqual(expected);
    });

    it('throws on getInstance / getAddress / getPartialAddress before any send-side call when nothing is locked', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt });
      // `getInstance` throws synchronously; `getAddress` / `getPartialAddress` are async and reject.
      expect(() => deploy.getInstance()).toThrow(/deployer is not yet locked/);
      await expect(deploy.getAddress()).rejects.toThrow(/deployer is not yet locked/);
      await expect(deploy.getPartialAddress()).rejects.toThrow(/deployer is not yet locked/);
    });

    it('rejects mutually exclusive `deployer` and `universalDeploy` at construction', () => {
      expect(() =>
        Contract.deploy(wallet, testContractArtifact, [], undefined, { salt, deployer: alice, universalDeploy: true }),
      ).toThrow(/mutually exclusive/);
    });

    it('throws when send-time `from` would imply a different deployer than the one locked at construction', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt, deployer: alice });
      await expect(deploy.send({ from: bob })).rejects.toThrow(/Deployer for this DeployMethod is locked/);
    });

    it('allows any sender when locked to universal at construction, and the address is stable', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt, universalDeploy: true });
      const expected = await expectedAddress(AztecAddress.ZERO);
      await expect(deploy.send({ from: alice })).resolves.toBeDefined();
      expect(await deploy.getAddress()).toEqual(expected);
      await expect(deploy.send({ from: bob })).resolves.toBeDefined();
      expect(await deploy.getAddress()).toEqual(expected);
    });

    it('throws on a second lock `from` after lazy-locking from the first', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt });
      await deploy.simulate({ from: alice });
      await expect(deploy.send({ from: bob })).rejects.toThrow(/Deployer for this DeployMethod is locked/);
    });

    it('locks to universal when `from` is NO_FROM', async () => {
      const deploy = Contract.deploy(wallet, testContractArtifact, [], undefined, { salt });
      await deploy.send({ from: NO_FROM });
      expect(await deploy.getAddress()).toEqual(await expectedAddress(AztecAddress.ZERO));
    });
  });
});
