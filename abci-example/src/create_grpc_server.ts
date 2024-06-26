import * as grpc from "@grpc/grpc-js";
import Mali from "mali";

export function createGrpcServer<TService>(config: GrpcServiceInit<TService>) {
  const server = new Mali();
  server.addService(config.service, config.name);
  server.use({ [config.name]: config.methods });
  return server;
}

interface GrpcServiceInit<TService> {
  name: string;
  service: TService;
  methods: GrpcMethod<TService>;
}

type GrpcMethod<T> = {
  [K in keyof T]: (context: GrpcContext<T[K]>) => Promise<void>;
};

type GrpcContext<T> = T extends grpc.MethodDefinition<infer Req, infer Res>
  ? MaliContext<Req, Res>
  : never;

export interface MaliContext<TRequest, TResponse, TMeta = unknown> {
  fullName: string;
  req: TRequest;
  res: TResponse;
  metadata: AppMetadata<TMeta>;
  get: <T extends keyof AppMetadata<TMeta>>(field: T) => AppMetadata<TMeta>[T];
  set: <T extends keyof AppMetadata<TMeta>>(
    field: T,
    value?: AppMetadata<TMeta>[T]
  ) => void;
  sendMetadata: (metadata: AppMetadata<TMeta>) => void;
  name: string;
  locals: Record<string, unknown>;
}

type AppMetadata<TMeta> = TMeta;
