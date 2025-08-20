type CustomValidationFunction = (
  value: any,
  object: any
) => { code: string; message: string }[];

type CustomRequiredFunction = (
  object: any
) => Boolean;

export interface Field {
  required?: boolean | CustomRequiredFunction;
  docs?: string;
  validation?: PropertyDecorator | CustomValidationFunction;
}
