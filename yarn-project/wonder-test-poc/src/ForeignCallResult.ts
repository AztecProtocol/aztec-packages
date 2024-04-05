interface Value {
  inner: string;
}

interface SingleForeignCallParam {
  Single: Value;
}

interface ArrayForeignCallParam {
  Array: Value[];
}

export type ForeignCallParam = SingleForeignCallParam | ArrayForeignCallParam;

export class ForeignCallResult {
  values: ForeignCallParam[];

  private constructor(values: ForeignCallParam[]) {
    this.values = values;
  }

  public static singleValue(val: string): ForeignCallResult {
    let param: SingleForeignCallParam = { Single: { inner: val } };
    return new ForeignCallResult([param]);
  }

  public static arrayValue(val: string[]): ForeignCallResult {
    let param: ArrayForeignCallParam = { Array: val.map(v => ({ inner: v.toString() })) };
    return new ForeignCallResult([param]);
  }
}
