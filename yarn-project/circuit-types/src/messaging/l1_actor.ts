import { randomInt } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * The sender of an L1 to L2 message.
 */
export class L1Actor {
  constructor(
    /**
     * The sender of the message.
     */
    public readonly sender: EthAddress,
    /**
     * The chain id on which the message was sent.
     */
    public readonly chainId: number,
  ) {}

  static empty() {
    return new L1Actor(EthAddress.ZERO, 0);
  }

  toFields(): Fr[] {
    return [this.sender.toField(), new Fr(BigInt(this.chainId))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.chainId);
  }

  static fromBuffer(buffer: Buffer | BufferReader): L1Actor {
    const reader = BufferReader.asReader(buffer);
    const ethAddr = reader.readObject(EthAddress);
    const chainId = reader.readNumber();
    return new L1Actor(ethAddr, chainId);
  }

  static random(): L1Actor {
    return new L1Actor(EthAddress.random(), randomInt(1000));
  }
}
