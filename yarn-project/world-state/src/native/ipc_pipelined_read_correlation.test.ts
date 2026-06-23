import { Fr } from '@aztec/foundation/curves/bn254';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { MerkleTreeId } from '@aztec/stdlib/trees';

import { jest } from '@jest/globals';

import { NativeWorldStateService } from './native_world_state.js';

jest.setTimeout(120_000);

const TRANSPORTS = ['uds', 'shm'] as const;
const N = 128;
const ITERATIONS = 40;

describe('IPC world-state pipelined read correlation', () => {
  for (const transport of TRANSPORTS) {
    describe(`transport=${transport}`, () => {
      let prevTransport: string | undefined;
      let ws: NativeWorldStateService;
      let fork: MerkleTreeWriteOperations;
      let leaves: Fr[];

      beforeAll(async () => {
        prevTransport = process.env.WSDB_TRANSPORT;
        process.env.WSDB_TRANSPORT = transport;
        ws = await NativeWorldStateService.tmp();

        fork = await ws.fork();
        leaves = Array.from({ length: N }, (_, i) => new Fr(BigInt(i) * 0x1_0000_0001n + 1n));
        await fork.appendLeaves(MerkleTreeId.NOTE_HASH_TREE, leaves);
      });

      afterAll(async () => {
        await fork?.close().catch(() => {});
        await ws?.close();
        if (prevTransport === undefined) {
          delete process.env.WSDB_TRANSPORT;
        } else {
          process.env.WSDB_TRANSPORT = prevTransport;
        }
      });

      it('matches every response across concurrent same-type reads', async () => {
        for (let iter = 0; iter < ITERATIONS; iter++) {
          const got = await Promise.all(
            leaves.map((_, i) => fork.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, BigInt(i))),
          );
          for (let i = 0; i < N; i++) {
            const v = got[i];
            if (v === undefined || !v.equals(leaves[i])) {
              const belongsTo = v === undefined ? 'undefined' : String(leaves.findIndex(l => l.equals(v)));
              throw new Error(
                `[${transport}] iter ${iter}: getLeafValue(index=${i}) returned value for index ` +
                  `${belongsTo}; expected ${leaves[i].toString()}, got ${v?.toString() ?? 'undefined'}`,
              );
            }
          }
        }
      });

      it('matches every response across concurrent mixed-type reads', async () => {
        for (let iter = 0; iter < ITERATIONS; iter++) {
          const checks: Promise<void>[] = [];
          for (let i = 0; i < N; i++) {
            const idx = BigInt(i);
            checks.push(
              (async () => {
                const v = await fork.getLeafValue(MerkleTreeId.NOTE_HASH_TREE, idx);
                if (v === undefined || !v.equals(leaves[i])) {
                  throw new Error(
                    `[${transport}] iter ${iter}: getLeafValue(${i}) wrong: ${v?.toString() ?? 'undefined'}`,
                  );
                }
              })(),
            );
            checks.push(
              (async () => {
                const idxs = await fork.findLeafIndices(MerkleTreeId.NOTE_HASH_TREE, [leaves[i]]);
                if (idxs[0] !== idx) {
                  throw new Error(
                    `[${transport}] iter ${iter}: findLeafIndices(${i}) returned ${idxs[0]}, expected ${idx}`,
                  );
                }
              })(),
            );
            checks.push(fork.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, idx).then(() => undefined));
          }
          await Promise.all(checks);
        }
      });
    });
  }
});
