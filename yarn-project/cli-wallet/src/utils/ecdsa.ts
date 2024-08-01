export function extractECDSAPublicKeyFromBase64String(publicKey: string): Buffer {
  const publicKeyBuffer = Buffer.from(publicKey, 'base64');
  let keyOffset = 0;
  const typeLen = publicKeyBuffer.readUInt32BE(keyOffset);
  keyOffset += 4;
  keyOffset += typeLen;

  const curveLen = publicKeyBuffer.readUInt32BE(keyOffset);
  keyOffset += 4;
  keyOffset += curveLen;

  const keyLen = publicKeyBuffer.readUInt32BE(keyOffset);
  keyOffset += 5; // 4+1 to extract the prefix
  return publicKeyBuffer.slice(keyOffset, keyOffset + keyLen - 1);
}
