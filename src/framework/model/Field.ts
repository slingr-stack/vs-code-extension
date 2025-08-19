type CustomValidationFunction = (
  value: any,
  object: any
) => { code: string; message: string }[];

export interface Field {
  required?: boolean | ((obj: any) => boolean);
  docs?: string;
  validation?: PropertyDecorator | CustomValidationFunction;
}
