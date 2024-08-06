import { Buffer } from 'buffer';
import net from 'net';

const SSH_AGENT_IDENTITIES_REQUEST = 11;
const SSH_AGENT_IDENTITIES_RESPONSE = 12;
const SSH_AGENT_SIGN_REQUEST = 13;
const SSH_AGENT_SIGN_RESPONSE = 14;

export function connectToAgent() {
  const socketPath = process.env.SSH_AUTH_SOCK;
  if (!socketPath) {
    throw new Error('SSH_AUTH_SOCK is not set');
  }
  return net.connect(socketPath);
}

type StoredKey = {
  type: string;
  publicKey: string;
  comment: string;
};

export async function getIdentities(): Promise<StoredKey[]> {
  return new Promise((resolve, reject) => {
    const stream = connectToAgent();
    stream.on('connect', () => {
      const request = Buffer.concat([
        Buffer.from([0, 0, 0, 5 + 4]), // length
        Buffer.from([SSH_AGENT_IDENTITIES_REQUEST]),
        Buffer.from([0, 0, 0, 0]), // flags
      ]);

      stream.write(request);
    });

    stream.on('data', data => {
      const responseType = data[4];
      if (responseType === SSH_AGENT_IDENTITIES_RESPONSE) {
        let offset = 5;
        const numKeys = data.readUInt32BE(offset);

        var keys = [];
        for (let i = 0; i < numKeys; i++) {
          offset += 4;
          const keyLength = data.readUInt32BE(offset);
          offset += 4;
          const key = data.slice(offset, offset + keyLength);
          offset += keyLength;
          const commentLength = data.readUInt32BE(offset);
          offset += 4;
          var comment = data.slice(offset, offset + commentLength);
          offset += commentLength;

          let keyOffset = 0;
          const typeLen = key.readUInt32BE(keyOffset);
          keyOffset += 4;
          const type = key.slice(keyOffset, keyOffset + typeLen);

          keys.push({
            type: type.toString('ascii'),
            publicKey: key.toString('base64'),
            comment: comment.toString('utf8'),
          });
        }
        stream.end();
        resolve(keys);
      } else {
        stream.end();
        reject(`Unexpected response type: ${responseType}`);
      }
    });
  });
}

export async function signWithAgent(keyType: Buffer, curveName: Buffer, publicKey: Buffer, data: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    const stream = connectToAgent();
    stream.on('connect', () => {
      // Construct the key blob
      const keyBlob = Buffer.concat([
        Buffer.from([0, 0, 0, keyType.length]),
        keyType,
        Buffer.from([0, 0, 0, curveName.length]),
        curveName,
        Buffer.from([0, 0, 0, publicKey.length + 1, 4]),
        publicKey,
      ]);
      const request = Buffer.concat([
        Buffer.from([0, 0, 0, 5 + keyBlob.length + 4 + data.length + 4]), // length
        Buffer.from([SSH_AGENT_SIGN_REQUEST]),
        Buffer.from([0, 0, 0, keyBlob.length]), // key blob length
        keyBlob,
        Buffer.from([0, 0, 0, data.length]), // data length
        data,
        Buffer.from([0, 0, 0, 0]), // flags
      ]);

      stream.write(request);
    });

    stream.on('data', data => {
      const type = data[4];

      if (type === SSH_AGENT_SIGN_RESPONSE) {
        const signatureLength = data.readUInt32BE(5);
        const signature = data.slice(9, 9 + signatureLength);

        stream.end();
        resolve(signature);
      } else {
        stream.end();
        reject(`Unexpected response type: ${type}`);
      }
    });
  });
}
