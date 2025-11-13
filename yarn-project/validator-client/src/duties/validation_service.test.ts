import { getAddressFromPrivateKey } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { EthAddress } from '@aztec/foundation/eth-address';
import { makeBlockProposal } from '@aztec/stdlib/testing';
import { Tx } from '@aztec/stdlib/tx';

import { generatePrivateKey } from 'viem/accounts';

import { LocalKeyStore } from '../key_store/local_key_store.js';
import { ValidationService } from './validation_service.js';

describe('ValidationService', () => {
  let service: ValidationService;
  let store: LocalKeyStore;
  let keys: `0x${string}`[];
  let addresses: EthAddress[];

  beforeEach(() => {
    keys = [generatePrivateKey(), generatePrivateKey()];
    addresses = keys.map(key => EthAddress.fromString(getAddressFromPrivateKey(key)));
    store = new LocalKeyStore(keys.map(key => Buffer32.fromString(key)));
    service = new ValidationService(store);
  });

  it('creates a proposal with txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposals = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
      publishFullTxs: true,
    });
    expect(proposals.length).toBe(5); // 1 original + 4 duplicates
    const proposal = proposals[0];
    expect(proposal.getSender()).toEqual(store.getAddress(0));
    expect(proposal.txs).toBeDefined();
    expect(proposal.txs).toBe(txs);
  });

  it('creates a proposal without txs appended', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const {
      payload: { header, archive, stateReference },
    } = makeBlockProposal({ txs });
    const proposals = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
      publishFullTxs: false,
    });
    expect(proposals.length).toBe(5); // 1 original + 4 duplicates
    const proposal = proposals[0];
    expect(proposal.getSender()).toEqual(addresses[0]);
    expect(proposal.txs).toBeUndefined();
  });

  it('attests to proposal', async () => {
    const txs = await Promise.all([Tx.random(), Tx.random()]);
    const proposal = makeBlockProposal({ txs });
    const attestations = await service.attestToProposal(proposal, addresses);
    expect(attestations.length).toBe(6); // 2 attestors × (1 original + 2 duplicates) = 6 total
    // First 3 attestations should be from addresses[0]
    expect(attestations[0].getSender()).toEqual(addresses[0]);
    expect(attestations[1].getSender()).toEqual(addresses[0]);
    expect(attestations[2].getSender()).toEqual(addresses[0]);
    // Last 3 attestations should be from addresses[1]
    expect(attestations[3].getSender()).toEqual(addresses[1]);
    expect(attestations[4].getSender()).toEqual(addresses[1]);
    expect(attestations[5].getSender()).toEqual(addresses[1]);
  });

  describe('Duplicate Proposals - Integration Tests', () => {
    it('should create multiple proposals with different signatures', async () => {
      const txs = await Promise.all([Tx.random(), Tx.random()]);
      const {
        payload: { header, archive, stateReference },
      } = makeBlockProposal({ txs });
      const proposals = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
        publishFullTxs: true,
      });

      // Should return array of 5 proposals (1 original + 4 duplicates)
      expect(proposals.length).toBe(5);

      // All should have same payload
      const firstPayload = proposals[0].payload;
      for (const proposal of proposals) {
        expect(proposal.payload.header.toBuffer().equals(firstPayload.header.toBuffer())).toBe(true);
        expect(proposal.payload.archive.equals(firstPayload.archive)).toBe(true);
      }

      // All should have different signatures
      for (let i = 0; i < proposals.length; i++) {
        for (let j = i + 1; j < proposals.length; j++) {
          expect(proposals[i].signature.equals(proposals[j].signature)).toBe(false);
        }
      }

      // All signatures should be valid (recover to correct address)
      for (const proposal of proposals) {
        const recovered = proposal.getSender();
        expect(recovered).toBeDefined();
        expect(recovered!.equals(addresses[0])).toBe(true);
      }
    });

    it('should create multiple attestations per attestor with different signatures', async () => {
      const txs = await Promise.all([Tx.random(), Tx.random()]);
      const proposal = makeBlockProposal({ txs });
      const attestations = await service.attestToProposal(proposal, addresses);

      // Should have 2 attestors × 3 attestations each = 6 total
      expect(attestations.length).toBe(6);

      // Group by attestor
      const byAttestor = new Map<string, typeof attestations>();
      for (const att of attestations) {
        const sender = att.getSender()!.toString();
        if (!byAttestor.has(sender)) {
          byAttestor.set(sender, []);
        }
        byAttestor.get(sender)!.push(att);
      }

      // Each attestor should have 3 attestations
      expect(byAttestor.get(addresses[0].toString())?.length).toBe(3);
      expect(byAttestor.get(addresses[1].toString())?.length).toBe(3);

      // All attestations from same attestor should have different signatures
      for (const [_, atts] of byAttestor) {
        for (let i = 0; i < atts.length; i++) {
          for (let j = i + 1; j < atts.length; j++) {
            expect(atts[i].signature.equals(atts[j].signature)).toBe(false);
          }
        }
      }

      // All attestations should have same payload
      const firstPayload = attestations[0].payload;
      for (const att of attestations) {
        expect(att.payload.header.toBuffer().equals(firstPayload.header.toBuffer())).toBe(true);
        expect(att.payload.archive.equals(firstPayload.archive)).toBe(true);
      }

      // All signatures should be valid (recover to correct addresses)
      for (const att of attestations) {
        const recovered = att.getSender();
        expect(recovered).toBeDefined();
        expect(addresses.some(addr => addr.equals(recovered!))).toBe(true);
      }
    });

    it('should create proposals with identical txHashes but different signatures', async () => {
      const txs = await Promise.all([Tx.random(), Tx.random()]);
      const {
        payload: { header, archive, stateReference },
      } = makeBlockProposal({ txs });
      const proposals = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
        publishFullTxs: false,
      });

      expect(proposals.length).toBe(5);

      // All proposals should have identical txHashes
      const firstTxHashes = proposals[0].txHashes;
      for (const proposal of proposals) {
        expect(proposal.txHashes.length).toBe(firstTxHashes.length);
        for (let i = 0; i < firstTxHashes.length; i++) {
          expect(proposal.txHashes[i].equals(firstTxHashes[i])).toBe(true);
        }
      }

      // But all signatures should be different
      const signatures = proposals.map(p => p.signature);
      for (let i = 0; i < signatures.length; i++) {
        for (let j = i + 1; j < signatures.length; j++) {
          expect(signatures[i].equals(signatures[j])).toBe(false);
        }
      }
    });

    it('should create deterministic duplicates with same k indices', async () => {
      const txs = await Promise.all([Tx.random(), Tx.random()]);
      const {
        payload: { header, archive, stateReference },
      } = makeBlockProposal({ txs });

      // Create proposals twice with same inputs
      const proposals1 = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
        publishFullTxs: true,
      });
      const proposals2 = await service.createBlockProposal(header, archive, stateReference, txs, addresses[0], {
        publishFullTxs: true,
      });

      expect(proposals1.length).toBe(5);
      expect(proposals2.length).toBe(5);

      // All corresponding proposals should have identical signatures
      // (because we're using same k indices for same payload)
      for (let i = 0; i < proposals1.length; i++) {
        expect(proposals1[i].signature.equals(proposals2[i].signature)).toBe(true);
      }
    });
  });
});
