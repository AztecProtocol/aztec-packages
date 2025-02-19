import { schemas as foundationSchemas } from '@aztec/foundation';

export const schemas = {
  NoteSelector: NoteSelector.schema,
  FunctionSelector: FunctionSelector.schema,
  ...foundationSchemas,
};

export const AbiDecodedSchema: ZodFor<AbiDecoded> = z.union([
  schemas.BigInt,
  z.boolean(),
  schemas.AztecAddress,
  z.array(z.lazy(() => AbiDecodedSchema)),
  z.record(z.lazy(() => AbiDecodedSchema)),
]);
