import { EthAddress } from '@aztec/foundation/eth-address';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { serializeToBuffer } from '@aztec/circuits.js/utils';
import { sha256 } from '@aztec/foundation/crypto';
import { toBigIntBE, toBufferBE } from '@aztec/foundation/bigint-buffer';
import { assertLength } from '@aztec/circuits.js';

// TODO: double check to buffer array calculations
export class L1ToL2Message {
  constructor(
    /// The sender of the message on L1.
    public readonly sender: L1Actor,
    /// The recipient of the message on L2.
    public readonly recipient: L2Actor,
    /// The hash of the message content.
    public readonly contentHash: Fr,
    /// The hash of the spending secret.
    public readonly secretHash: Fr,
    /// The deadline for the message.
    public readonly deadline: number,
    /// The fee for the message.
    public readonly fee: number,
  ) {}

  // TODO: sha256 hash of the message packed the same as solidity
  hash(): Fr {
    const buf = this.toBuffer();
    // TODO: cleanup ripped from l2 block
    const temp = toBigIntBE(sha256(buf));
    // Prime order of BN254 curve
    const p = BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617');
    return Fr.fromBuffer(toBufferBE(temp % p, 32));
  }

  toFieldArray(): Fr[] {
    return [
      ...this.sender.toFieldArray(),
      ...this.recipient.toFieldArray(),
      this.contentHash,
      this.secretHash,
      new Fr(BigInt(this.deadline)),
      new Fr(BigInt(this.fee)),
    ];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.recipient, this.contentHash, this.secretHash, this.deadline, this.fee);
  }

  static empty(): L1ToL2Message {
    return new L1ToL2Message(L1Actor.empty(), L2Actor.empty(), Fr.ZERO, Fr.ZERO, 0, 0);
  }
}

export class L1Actor {
  constructor(
    /// The sender of the message.
    public readonly sender: EthAddress,
    /// The chain id on which the message was sent.
    public readonly chainId: number,
  ) {}

  static empty() {
    return new L1Actor(EthAddress.ZERO, 0);
  }

  toFieldArray(): Fr[] {
    return [this.sender.toField(), new Fr(BigInt(this.chainId))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.sender, this.chainId);
  }
}

export class L2Actor {
  constructor(
    /// The recipient of the message.
    public readonly recipient: AztecAddress,
    /// The version of the protocol
    public readonly version: number,
  ) {}

  static empty() {
    return new L2Actor(AztecAddress.ZERO, 0);
  }

  toFieldArray(): Fr[] {
    return [this.recipient.toField(), new Fr(BigInt(this.version))];
  }

  toBuffer(): Buffer {
    return serializeToBuffer(this.recipient, this.version);
  }
}
