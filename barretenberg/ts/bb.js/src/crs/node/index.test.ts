import { execFile } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, truncateSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

import { Crs, GrumpkinCrs } from './index.js';

const BN254_G1 = pattern(8 * 32, 7);
const BN254_G2 = pattern(128, 11);
const GRUMPKIN_G1 = pattern(4 * 64, 13);

function pattern(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * seed + 3) & 0xff);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

type Gate = { afterBytes: number; open: Promise<void>; started?: () => void };

/**
 * Serves the fixture files over a fake fetch. Gates apply, in call order, to the
 * G1 requests only, so the test controls when each fill writes its bytes.
 */
function installFetch(gates: Gate[]) {
  const files: Record<string, Uint8Array> = {
    '/g1_compressed.dat': BN254_G1,
    '/g2.dat': BN254_G2,
    '/grumpkin_g1_v2.dat': GRUMPKIN_G1,
  };
  let g1Calls = 0;
  globalThis.fetch = ((url: string, options: RequestInit = {}) => {
    const { pathname } = new URL(url);
    const headers = (options.headers ?? {}) as Record<string, string>;
    const range = /bytes=0-(\d+)/.exec(headers.Range ?? '');
    const body = files[pathname].slice(0, range ? Number(range[1]) + 1 : undefined);
    const gate = pathname === '/g2.dat' ? undefined : gates[g1Calls++];
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        if (gate) {
          gate.started?.();
          controller.enqueue(body.slice(0, gate.afterBytes));
          await gate.open;
          controller.enqueue(body.slice(gate.afterBytes));
        } else {
          controller.enqueue(body);
        }
        controller.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: 206 }));
  }) as typeof fetch;
}

describe('Crs cache fill', () => {
  const realFetch = globalThis.fetch;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bb-crs-'));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves two concurrent fills of one empty cache from one complete file', async () => {
    const firstChunkSent = deferred();
    const finishA = deferred();
    const finishB = deferred();
    installFetch([
      { afterBytes: 64, open: finishA.promise, started: firstChunkSent.resolve },
      { afterBytes: 0, open: finishB.promise },
    ]);

    const a = Crs.new(4, dir).then(crs => ({ g1: crs.getG1Data(), g2: crs.getG2Data() }));
    await firstChunkSent.promise;
    const b = Crs.new(4, dir).then(crs => ({ g1: crs.getG1Data(), g2: crs.getG2Data() }));
    await sleep(200);
    finishA.resolve();
    const aData = await a;
    finishB.resolve();
    const bData = await b;

    expect(aData.g1).toEqual(BN254_G1.slice(0, 128));
    expect(aData.g2).toEqual(BN254_G2);
    expect(bData.g1).toEqual(BN254_G1.slice(0, 128));
    expect(bData.g2).toEqual(BN254_G2);
    expect(readdirSync(dir).sort()).toEqual(['bn254_g1_compressed.dat', 'bn254_g2.dat']);
    expect(new Uint8Array(readFileSync(join(dir, 'bn254_g1_compressed.dat')))).toEqual(BN254_G1.slice(0, 128));
  });

  it('serves two concurrent Grumpkin fills of one empty cache from one complete file', async () => {
    const firstChunkSent = deferred();
    const finishA = deferred();
    const finishB = deferred();
    installFetch([
      { afterBytes: 64, open: finishA.promise, started: firstChunkSent.resolve },
      { afterBytes: 0, open: finishB.promise },
    ]);

    const a = GrumpkinCrs.new(2, dir).then(crs => crs.getG1Data());
    await firstChunkSent.promise;
    const b = GrumpkinCrs.new(2, dir).then(crs => crs.getG1Data());
    await sleep(200);
    finishA.resolve();
    const aData = await a;
    finishB.resolve();
    const bData = await b;

    expect(aData).toEqual(GRUMPKIN_G1.slice(0, 128));
    expect(bData).toEqual(GRUMPKIN_G1.slice(0, 128));
    expect(readdirSync(dir).sort()).toEqual(['grumpkin_g1_v2.flat.dat']);
  });

  it('rejects a short download instead of caching it', async () => {
    installFetch([]);
    const short = new Uint8Array(3 * 32);
    globalThis.fetch = (() => Promise.resolve(new Response(short, { status: 206 }))) as typeof fetch;

    await expect(Crs.new(4, dir)).rejects.toThrow(/bytes/);
    expect(readdirSync(dir)).toEqual([]);
  });

  it('throws on a short read of the compressed cache', async () => {
    installFetch([]);
    const crs = await Crs.new(4, dir);
    truncateSync(join(dir, 'bn254_g1_compressed.dat'), 64);

    expect(() => crs.getG1Data()).toThrow(/bytes/);
  });

  it('throws on a short read of the uncompressed cache', async () => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'bn254_g1.dat'), pattern(4 * 64, 5));
    writeFileSync(join(dir, 'bn254_g2.dat'), BN254_G2);
    const crs = await Crs.new(4, dir);
    truncateSync(join(dir, 'bn254_g1.dat'), 100);

    expect(() => crs.getG1Data()).toThrow(/bytes/);
  });

  it('does not replace a larger uncompressed cache with a smaller one', async () => {
    const larger = pattern(8 * 64, 5);
    writeFileSync(join(dir, 'bn254_g1.dat'), larger);
    writeFileSync(join(dir, 'bn254_g2.dat'), BN254_G2);
    const crs = await Crs.new(4, dir);

    await crs.cacheUncompressed(larger.slice(0, 4 * 64));

    expect(new Uint8Array(readFileSync(join(dir, 'bn254_g1.dat')))).toEqual(larger);
    expect(crs.getG1Data()).toEqual(larger.slice(0, 4 * 64));
  });

  it('serves two processes filling one empty cache with different sizes', async () => {
    const script = join(dir, 'fill.mjs');
    const cache = join(dir, 'cache');
    writeFileSync(
      script,
      `
      const [dir, numPoints, firstChunkDelayMs, chunkDelayMs, moduleUrl] = process.argv.slice(2);
      const pattern = (length, seed) => Uint8Array.from({ length }, (_, i) => (i * seed + 3) & 0xff);
      const files = { '/g1_compressed.dat': pattern(8 * 32, 7), '/g2.dat': pattern(128, 11) };
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      globalThis.fetch = (url, options = {}) => {
        const { pathname } = new URL(url);
        const range = /bytes=0-(\\d+)/.exec(options.headers?.Range ?? '');
        const body = files[pathname].slice(0, range ? Number(range[1]) + 1 : undefined);
        const stream = new ReadableStream({
          async start(controller) {
            await sleep(Number(firstChunkDelayMs));
            for (let i = 0; i < 4; i++) {
              controller.enqueue(body.slice((i * body.length) / 4, ((i + 1) * body.length) / 4));
              await sleep(Number(chunkDelayMs));
            }
            controller.close();
          },
        });
        return Promise.resolve(new Response(stream, { status: 206 }));
      };
      const { Crs } = await import(moduleUrl);
      const crs = await Crs.new(Number(numPoints), dir);
      process.stdout.write(JSON.stringify({ g1: Array.from(crs.getG1Data()), g2: Array.from(crs.getG2Data()) }));
      `,
    );
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const moduleUrl = new URL('./index.js', import.meta.url).href;
    const run = (numPoints: number, firstChunkDelayMs: number, chunkDelayMs: number) =>
      promisify(execFile)(
        process.execPath,
        [script, cache, String(numPoints), String(firstChunkDelayMs), String(chunkDelayMs), moduleUrl],
        {
          env: { ...process.env, NODE_NO_WARNINGS: '1' },
        },
      ).then(({ stdout }) => JSON.parse(stdout) as { g1: number[]; g2: number[] });

    const a = run(4, 0, 100);
    await sleep(150);
    const b = run(8, 600, 0);
    const [aData, bData] = await Promise.all([a, b]);

    expect(Uint8Array.from(aData.g1)).toEqual(BN254_G1.slice(0, 128));
    expect(Uint8Array.from(aData.g2)).toEqual(BN254_G2);
    expect(Uint8Array.from(bData.g1)).toEqual(BN254_G1);
    expect(Uint8Array.from(bData.g2)).toEqual(BN254_G2);
    expect(readdirSync(cache).sort()).toEqual(['bn254_g1_compressed.dat', 'bn254_g2.dat']);
    expect(statSync(join(cache, 'bn254_g1_compressed.dat')).size).toBe(256);
  }, 60000);
});
