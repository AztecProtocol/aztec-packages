import type { Fr } from '@aztec/foundation/curves/bn254';

import { z } from 'zod';

import type { FunctionSelector } from '../abi/function_selector.js';
import type { AztecAddress } from '../aztec-address/index.js';
import { schemas, zodFor } from '../schemas/index.js';

type AllowedInstanceFunction = { address: AztecAddress; selector: FunctionSelector };
type AllowedClassFunction = { classId: Fr; selector: FunctionSelector };

export type AllowedElement = AllowedInstanceFunction | AllowedClassFunction;

export const AllowedElementSchema = zodFor<AllowedElement>()(
  z.union([
    z.object({ address: schemas.AztecAddress, selector: schemas.FunctionSelector }),
    z.object({ classId: schemas.Fr, selector: schemas.FunctionSelector }),
  ]),
);
