/**
 * Minimal byte-in / byte-out interface that the ipc-codegen-emitted
 * <Service>Api types consume. Both UDS and SHM transports satisfy this.
 */
export interface IpcClientAsync {
  call(input: Uint8Array): Promise<Uint8Array>;
  destroy(): Promise<void>;
}

export interface IpcClientSync {
  call(input: Uint8Array): Uint8Array;
  destroy(): void;
}
