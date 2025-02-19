import { type ZodType } from 'zod';

export type ZodFor<T> = ZodType<T, any, any>;
