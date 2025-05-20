import type { Archiver } from '@aztec/archiver';
import type { AztecNodeConfig, AztecNodeService } from '@aztec/aztec-node';
import {
  type AztecNode,
  ContractDeployer,
  EthAddress,
  Fr,
  type PXE,
  type Wallet,
  waitForProven,
} from '@aztec/aztec.js';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { ConsensusPayload } from '@aztec/stdlib/p2p';
import { BlockAttestation } from '@aztec/stdlib/p2p';

import { privateKeyToAccount } from 'viem/accounts';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

const VALIDATOR_COUNT = 5;

describe('e2e_multi_validator_node', () => {
  let initialValidatorPrivateKeys: `0x${string}`[];
  let validatorAddresses: `0x${string}`[];
  // let pxe: PXE;
  let teardown: () => Promise<void>;
  let owner: Wallet;
  let aztecNode: AztecNode;
  let config: AztecNodeConfig;

  const artifact = StatefulTestContractArtifact;
  beforeAll(async () => {
    initialValidatorPrivateKeys = Array.from(
      { length: VALIDATOR_COUNT },
      (_, i) => `0x${getPrivateKeyFromIndex(i)!.toString('hex')}` as `0x${string}`,
    );
    validatorAddresses = initialValidatorPrivateKeys.map(pk => {
      const account = privateKeyToAccount(pk);
      return EthAddress.fromString(account.address).toString();
    });
    const { aztecSlotDuration: _aztecSlotDuration } = getL1ContractsConfigEnvVars();

    ({
      teardown,
      // logger,
      wallets: [owner],
      // pxe,
      aztecNode,
      config,
    } = await setup(1, {
      initialValidatorPrivateKeys,
      minTxsPerBlock: 1,
    }));
  });

  afterAll(async () => {
    await teardown();
  });

  it('should build blocks & attest with multiple validator keys', async () => {
    const deployer = new ContractDeployer(artifact, owner);

    const ownerAddress = owner.getCompleteAddress().address;
    const sender = ownerAddress;
    const provenTx = await deployer.deploy(ownerAddress, sender, 1).prove({
      contractAddressSalt: new Fr(BigInt(1)),
      skipClassRegistration: true,
      skipPublicDeployment: true,
    });
    const tx = await provenTx.send().wait();
    await waitForProven(aztecNode, tx, {
      provenTimeout: config.aztecProofSubmissionWindow * config.aztecSlotDuration,
    });
    expect(tx.blockNumber).toBeDefined();

    const dataStore = ((aztecNode as AztecNodeService).getBlockSource() as Archiver).dataStore;
    const [block] = await dataStore.getPublishedBlocks(tx.blockNumber!, tx.blockNumber!);
    const payload = ConsensusPayload.fromBlock(block.block);
    const attestations = block.signatures
      .filter(s => !s.isEmpty)
      .map(sig => new BlockAttestation(new Fr(block.block.number), payload, sig));

    expect(attestations.length).toBe(4); // Math.floor((5 * 2) / 3) + 1

    const signers = attestations.map(att => att.getSender().toString());

    expect(signers).toEqual(expect.arrayContaining(validatorAddresses));
    // expect(block.transactions.length).toBe(1);
    // expect(block.transactions[0].transactionHash).toBe(tx.hash);
  });
});
