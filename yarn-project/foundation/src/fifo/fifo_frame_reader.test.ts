import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PassThrough } from 'node:stream';

import { FifoFrameReader } from './fifo_frame_reader.js';

/** Build a length-delimited frame buffer for the given payload. */
function buildFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

/** Collect N frames from a reader, returning them as a promise. */
function collectFrames(reader: FifoFrameReader, count: number): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const frames: Buffer[] = [];
    reader.on('frame', frame => {
      frames.push(frame);
      if (frames.length >= count) {
        resolve(frames);
      }
    });
    reader.on('error', reject);
  });
}

describe('FifoFrameReader', () => {
  it('reads a single frame', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const framesPromise = collectFrames(reader, 1);
    stream.write(buildFrame(Buffer.from('hello world')));
    stream.end();

    const frames = await framesPromise;
    expect(frames).toHaveLength(1);
    expect(frames[0].toString()).toBe('hello world');
    reader.stop();
  });

  it('reads multiple frames from a single push', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const framesPromise = collectFrames(reader, 3);

    const combined = Buffer.concat([
      buildFrame(Buffer.from('aaa')),
      buildFrame(Buffer.from('bbb')),
      buildFrame(Buffer.from('ccc')),
    ]);
    stream.write(combined);
    stream.end();

    const frames = await framesPromise;
    expect(frames).toHaveLength(3);
    expect(frames.map(f => f.toString())).toEqual(['aaa', 'bbb', 'ccc']);
    reader.stop();
  });

  it('handles frames split across multiple chunks', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const framesPromise = collectFrames(reader, 1);

    const payload = Buffer.from('this is a longer payload that will be split');
    const frame = buildFrame(payload);

    // Split the frame into small chunks
    for (let i = 0; i < frame.length; i += 5) {
      stream.write(frame.subarray(i, Math.min(i + 5, frame.length)));
    }
    stream.end();

    const frames = await framesPromise;
    expect(frames).toHaveLength(1);
    expect(frames[0].toString()).toBe(payload.toString());
    reader.stop();
  });

  it('handles header split across chunks', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const framesPromise = collectFrames(reader, 1);

    const payload = Buffer.from('data');
    const frame = buildFrame(payload);

    // Split in the middle of the 4-byte header
    stream.write(frame.subarray(0, 2));
    stream.write(frame.subarray(2));
    stream.end();

    const frames = await framesPromise;
    expect(frames).toHaveLength(1);
    expect(frames[0].toString()).toBe('data');
    reader.stop();
  });

  it('emits error on zero-length payload', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const errorPromise = new Promise<Error>(resolve => {
      reader.on('error', resolve);
    });

    const header = Buffer.alloc(4);
    header.writeUInt32BE(0, 0);
    stream.write(header);

    const error = await errorPromise;
    expect(error.message).toContain('Invalid payload length: 0');
  });

  it('emits error on oversized payload', async () => {
    const maxSize = 100;
    const reader = new FifoFrameReader(maxSize);
    const stream = new PassThrough();
    reader.startFromStream(stream);

    const errorPromise = new Promise<Error>(resolve => {
      reader.on('error', resolve);
    });

    const header = Buffer.alloc(4);
    header.writeUInt32BE(maxSize + 1, 0);
    stream.write(header);

    const error = await errorPromise;
    expect(error.message).toContain(`Invalid payload length: ${maxSize + 1}`);
  });

  it('emits end when stream ends', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const endPromise = new Promise<void>(resolve => {
      reader.on('end', resolve);
    });

    stream.end();
    await endPromise;
    reader.stop();
  });

  it('reads valid frames before an invalid frame', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const frames: Buffer[] = [];
    reader.on('frame', frame => frames.push(frame));

    const errorPromise = new Promise<Error>(resolve => {
      reader.on('error', resolve);
    });

    // Write 2 valid frames then an invalid one
    stream.write(buildFrame(Buffer.from('good1')));
    stream.write(buildFrame(Buffer.from('good2')));

    // Invalid: zero length header
    const badHeader = Buffer.alloc(4);
    badHeader.writeUInt32BE(0, 0);
    stream.write(badHeader);

    await errorPromise;
    expect(frames).toHaveLength(2);
    expect(frames[0].toString()).toBe('good1');
    expect(frames[1].toString()).toBe('good2');
  });

  it('throws if started twice', () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    expect(() => reader.startFromStream(new PassThrough())).toThrow('already running');
    reader.stop();
  });

  it('handles large payloads', async () => {
    const stream = new PassThrough();
    const reader = new FifoFrameReader();
    reader.startFromStream(stream);

    const framesPromise = collectFrames(reader, 1);

    // 1MB payload
    const payload = Buffer.alloc(1024 * 1024, 0x42);
    stream.write(buildFrame(payload));
    stream.end();

    const frames = await framesPromise;
    expect(frames).toHaveLength(1);
    expect(frames[0].length).toBe(1024 * 1024);
    expect(frames[0][0]).toBe(0x42);
    reader.stop();
  });

  it('reads frames from a real named FIFO via start()', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fifo-reader-test-'));
    const fifoPath = path.join(dir, 'results.fifo');
    execFileSync('mkfifo', [fifoPath]);

    const reader = new FifoFrameReader();
    reader.start(fifoPath);

    // Open a writer that outlives stop(), mimicking a native process that survives teardown. The
    // reader must still release its handle so the host process can exit (covered by start() using a
    // non-blocking pipe handle rather than a blocking fs read).
    const writeFd = fs.openSync(fifoPath, fs.constants.O_WRONLY);
    try {
      const framesPromise = collectFrames(reader, 2);
      fs.writeSync(writeFd, Buffer.concat([buildFrame(Buffer.from('one')), buildFrame(Buffer.from('two'))]));
      const frames = await framesPromise;
      expect(frames.map(f => f.toString())).toEqual(['one', 'two']);
    } finally {
      reader.stop();
      fs.closeSync(writeFd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
