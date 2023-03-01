import { ClassConverter } from './ClassConverter.js';

export function convertFromJsonObj(cc: ClassConverter, obj: any): any {
  if (!obj) {
    return obj; // Primitive type
  }
  // Is this a convertible type?
  if (typeof obj.type === 'string' && typeof obj.data === 'string') {
    return cc.toClassObj(obj);
  }
  // Is this an array?
  if (Array.isArray(obj)) {
    return obj.map((x: any) => convertFromJsonObj(cc, x));
  }
  // Is this a dictionary?
  if (obj.constructor === Object) {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = convertFromJsonObj(cc, obj[key]);
    }
    return newObj;
  }

  // Leave alone, assume JSON primitive
  return obj;
}

export function convertToJsonObj(cc: ClassConverter, obj: any): any {
  if (!obj) {
    return obj; // Primitive type
  }
  // Is this a convertible type?
  if (obj.constructor.fromString) {
    return cc.toJsonObj(obj);
  }
  // Is this an array?
  if (Array.isArray(obj)) {
    return obj.map((x: any) => convertToJsonObj(cc, x));
  }
  // Is this a dictionary?
  if (obj.constructor === Object) {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = convertToJsonObj(cc, obj[key]);
    }
    return newObj;
  }

  // Leave alone, assume JSON primitive
  return obj;
}
