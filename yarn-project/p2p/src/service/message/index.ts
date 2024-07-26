interface Message<Type> {
  encode(): Buffer;
  decode(buffer: Buffer): Type;
  handleGossipMessage(message: Type): void;
}
