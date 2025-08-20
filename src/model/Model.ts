import { validate, ValidationError } from "class-validator";
import "reflect-metadata";

export interface ModelOptions {
  docs?: string;
}




export function Model(options?: ModelOptions) {
  return function (constructor: Function) {
    Reflect.defineMetadata("model:docs", options?.docs, constructor);
  };
}
