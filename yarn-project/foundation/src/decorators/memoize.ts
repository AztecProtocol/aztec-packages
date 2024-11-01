export function memoize<This extends object, Result>(fn: () => Result, context: ClassMethodDecoratorContext) {
  return function (this: This) {
    const key = `__${String(context.name)}_value`;
    const thisWithKey = this as { [key: string]: Result };
    if (!(key in this)) {
      const result = fn.call(this);
      thisWithKey[key] = result;
    }
    return thisWithKey[key];
  };
}
