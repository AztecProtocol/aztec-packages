/**
 * Strips methods of a type.
 */
export type FieldsOf<T> = {
  // eslint-disable-next-line @typescript-eslint/ban-types
  [P in keyof T as T[P] extends Function ? never : P]: T[P];
};

/**
 * Does this own the property?
 * In other words, ensure this property was not inherited.
 * @param obj - An object.
 * @param method - A property name.
 */
export const hasOwnProperty = (obj: any, propertyName: string) =>
  Object.prototype.hasOwnProperty.call(obj, propertyName);
