export function pingHandler(_msg: any) {
  return Promise.resolve(Uint8Array.from(Buffer.from('pong')));
}

export function statusHandler(_msg: any) {
  return Promise.resolve(Uint8Array.from(Buffer.from('ok')));
}
