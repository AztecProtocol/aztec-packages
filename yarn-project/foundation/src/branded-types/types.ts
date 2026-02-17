/** Adds a branding to a type for nominal typing. */
export type Branded<T, Brand> = T & { _branding: Brand };
