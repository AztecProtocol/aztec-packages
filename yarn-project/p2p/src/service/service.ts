export interface P2PService {
  start(): Promise<void>;

  stop(): Promise<void>;
}
