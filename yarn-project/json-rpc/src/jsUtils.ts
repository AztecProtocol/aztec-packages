// Make sure this property was not inherited
export const hasOwnProperty = (class_: any, method: string) => Object.prototype.hasOwnProperty.call(class_, method);
export const assert = (x: any, err: string) => {
  if (!x) {
    throw new Error(err);
  }
};
