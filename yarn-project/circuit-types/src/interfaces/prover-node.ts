/* eslint-disable prefer-rest-params */
import { type Signature } from '@aztec/foundation/eth-signature';
import { type ApiServerFor } from '@aztec/foundation/json-rpc/client';
import { ApiBrand, type ApiHandlerFor } from '@aztec/foundation/json-rpc/server';
import { parse, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';

// Required by ts to export the schema of EpochProofQuote
export { type Signature };

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// The interface. Describes what methods exactly should be exposed. Nothing about validation here.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

const EpochProvingJobState = [
  'initialized',
  'processing',
  'awaiting-prover',
  'publishing-proof',
  'completed',
  'failed',
] as const;

export type EpochProvingJobState = (typeof EpochProvingJobState)[number];

/** JSON RPC public interface to a prover node. */
export interface ProverNodeApi {
  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]>;

  startProof(epochNumber: number): Promise<void>;

  prove(epochNumber: number): Promise<void>;

  sendEpochProofQuote(quote: EpochProofQuote): Promise<void>;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Option 1: Declarative schemas for input and output. We define one of this for each interface, and feed them into
// a validator that will validate args or ret using these schemas. This validator gets used as part of the json
// rpc client or server.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ProverNodeApiSchema implements ApiSchemaFor<ProverNodeApi> {
  getJobs = {
    ret: z.array(z.object({ uuid: z.string().uuid(), status: z.enum(EpochProvingJobState) })),
  } as const;

  startProof = { args: [z.number()] } as const;

  prove = { args: [z.number()] } as const;

  sendEpochProofQuote = { args: [EpochProofQuote.schema] } as const;
}

export class Validator<T> {
  constructor(public readonly schema: ApiSchemaFor<T>) {}

  // TODO: Remove `any` types
  // TODO: Check this works with void return types
  public validateArgs(methodName: string, args: any[]): any[] {
    const schema = (this.schema as any)[methodName]?.args;
    return schema ? schema.parse(args) : args;
  }

  public validateReturn(methodName: string, ret: any): any {
    const schema = (this.schema as any)[methodName]?.ret;
    return schema ? schema.parse(ret) : ret;
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Option 2: Very similar to option 1, but we use zod's built-in "function" type to declare the input and output schemas.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ProverNodeApiSchema2 implements ApiSchemaFor2<ProverNodeApi> {
  getJobs = z
    .function()
    .args()
    .returns(z.array(z.object({ uuid: z.string().uuid(), status: z.enum(EpochProvingJobState) })));

  startProof = z.function().args(z.number()).returns(z.void());

  prove = z.function().args(z.number()).returns(z.void());

  sendEpochProofQuote = z.function().args(EpochProofQuote.schema).returns(z.void());
}

export class Validator2<T> {
  constructor(public readonly schema: ApiSchemaFor2<T>) {}

  // TODO: Remove typecasts
  public validateArgs(methodName: string, args: any[]): any[] {
    const schema = this.schema[methodName as keyof ApiSchemaFor2<T>];
    return schema.parameters().parse(args);
  }

  public validateReturn(methodName: string, ret: any): any {
    const schema = this.schema[methodName as keyof ApiSchemaFor2<T>];
    return schema.returnType().parse(ret);
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Option 3: Imperative instead of declarative approach. Requires separate implementations for validating inputs and
// outputs. More verbose overall, but gives finer control (which we probably won't need).
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export class ProverNodeApiHandler implements ApiHandlerFor<ProverNodeApi> {
  __branding = ApiBrand;

  constructor(public readonly implementation: ProverNodeApi) {}

  startProof(): Promise<void> {
    return this.implementation.startProof(...parse(arguments, schemas.Integer));
  }

  prove(): Promise<void> {
    return this.implementation.prove(...parse(arguments, schemas.Integer));
  }

  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    return this.implementation.getJobs();
  }

  sendEpochProofQuote(): Promise<void> {
    return this.implementation.sendEpochProofQuote(...parse(arguments, EpochProofQuote.schema));
  }
}

export class ProverNodeApiClient implements ProverNodeApi {
  constructor(public readonly server: ApiServerFor<ProverNodeApi>) {}

  getJobs(): Promise<{ uuid: string; status: EpochProvingJobState }[]> {
    const schema = z.array(
      z.object({
        uuid: z.string().uuid(),
        status: z.enum(EpochProvingJobState),
      }),
    );

    return this.server.getJobs().then(schema.parse);
  }

  async startProof(epochNumber: number): Promise<void> {
    await this.server.startProof(epochNumber);
  }

  async prove(epochNumber: number): Promise<void> {
    await this.server.prove(epochNumber);
  }

  async sendEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    await this.server.sendEpochProofQuote(quote);
  }
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// End of stuff to look at. Below is just type definitions and utility types.
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

type ZodFor<T> = z.ZodType<T, z.ZodTypeDef, any>;
type MapZodType<T> = T extends []
  ? []
  : T extends [infer Head, ...infer Rest]
  ? [ZodFor<Head>, ...MapZodType<Rest>]
  : never;

type ApiSchemaForArgs<Args> = Args extends [] ? { args?: undefined } : { args: Readonly<MapZodType<Args>> };
type ApiSchemaForRet<Ret> = Ret extends void ? { ret?: undefined } : { ret: ZodFor<Ret> };

type ApiSchemaFor<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer Ret>
    ? ApiSchemaForArgs<Args> & ApiSchemaForRet<Ret>
    : never;
};

type ApiSchemaFor2<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer Ret>
    ? z.ZodFunction<z.ZodTuple<MapZodType<Args>, z.ZodUnknown>, ZodFor<Ret>>
    : never;
};
