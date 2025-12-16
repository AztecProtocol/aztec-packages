import { AuthRequest, AuthResponse } from './auth.js';

describe('auth request', () => {
  it('should encode and decode auth request', () => {
    const request = AuthRequest.random();
    const encoded = request.toBuffer();
    const decoded = AuthRequest.fromBuffer(encoded);
    expect(decoded.challenge.toString()).toEqual(request.challenge.toString());
    expect(decoded.status.compressedComponentsVersion).toEqual(request.status.compressedComponentsVersion);
    expect(decoded.status.latestBlockNumber).toEqual(request.status.latestBlockNumber);
    expect(decoded.status.latestBlockHash).toEqual(request.status.latestBlockHash);
    expect(decoded.status.finalisedBlockNumber).toEqual(request.status.finalisedBlockNumber);
  });

  it('should encode and decode auth response', () => {
    const request = AuthResponse.random();
    const encoded = request.toBuffer();
    const decoded = AuthResponse.fromBuffer(encoded);
    expect(decoded.signature.toString()).toEqual(request.signature.toString());
    expect(decoded.status.compressedComponentsVersion).toEqual(request.status.compressedComponentsVersion);
    expect(decoded.status.latestBlockNumber).toEqual(request.status.latestBlockNumber);
    expect(decoded.status.latestBlockHash).toEqual(request.status.latestBlockHash);
    expect(decoded.status.finalisedBlockNumber).toEqual(request.status.finalisedBlockNumber);
  });
});
