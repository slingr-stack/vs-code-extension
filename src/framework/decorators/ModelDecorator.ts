import "reflect-metadata";
import type { Model } from "../model/Model";


export interface ModelOptions extends Model {}

export function Model(options?: ModelOptions) {
  return function (constructor: Function) {
    Reflect.defineMetadata("model:docs", options?.docs, constructor);
  };
}
