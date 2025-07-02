import { randomBytes } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';

import { AuthRequest, AuthResponse } from './auth.js';
import { StatusMessage } from './status.js';

describe('auth request', () => {
  it('should encode and decode auth request', () => {
    const status = new StatusMessage(
      'Test Version',
      Math.ceil(Math.random() * 400),
      randomBytes(32).toString('hex'),
      Math.ceil(Math.random() * 300),
    );
    const challenge = Fr.random();
    const request = new AuthRequest(status, challenge);
    const encoded = request.toBuffer();
    const decoded = AuthRequest.fromBuffer(encoded);
    expect(decoded.challenge.toString()).toEqual(request.challenge.toString());
    expect(decoded.status.compressedComponentsVersion).toEqual(request.status.compressedComponentsVersion);
    expect(decoded.status.latestBlockNumber).toEqual(request.status.latestBlockNumber);
    expect(decoded.status.latestBlockHash).toEqual(request.status.latestBlockHash);
    expect(decoded.status.finalisedBlockNumber).toEqual(request.status.finalisedBlockNumber);
  });

  it('should encode and decode auth response', () => {
    const status = new StatusMessage(
      'Test Version',
      Math.ceil(Math.random() * 400),
      randomBytes(32).toString('hex'),
      Math.ceil(Math.random() * 300),
    );
    const challenge = Fr.random();
    const request = new AuthResponse(status, challenge);
    const encoded = request.toBuffer();
    const decoded = AuthRequest.fromBuffer(encoded);
    expect(decoded.challenge.toString()).toEqual(request.signature.toString());
    expect(decoded.status.compressedComponentsVersion).toEqual(request.status.compressedComponentsVersion);
    expect(decoded.status.latestBlockNumber).toEqual(request.status.latestBlockNumber);
    expect(decoded.status.latestBlockHash).toEqual(request.status.latestBlockHash);
    expect(decoded.status.finalisedBlockNumber).toEqual(request.status.finalisedBlockNumber);
  });
});
