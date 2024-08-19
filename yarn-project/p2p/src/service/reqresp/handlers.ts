export function pingHandler(msg: any) {
  return Uint8Array.from(Buffer.from('pong'));
}

export function statusHandler(msg: any) {
  return Uint8Array.from(Buffer.from('ok'));
}
