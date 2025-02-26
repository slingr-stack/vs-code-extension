import 'reflect-metadata';

interface DataModelConfig {
}

export function DataModel(config?: DataModelConfig): ClassDecorator {
  return function <T extends Function>(constructor: T) {
    Reflect.defineMetadata('dataModelConfig', config, constructor);
    return constructor;
  };
}

interface FieldRequired {
    type: 'always' | 'never' | 'conditional',
    condition?: (data: any) => boolean
}

type FieldType = 'array' | 'id' | 'relationship' | 'text' | 'number' | 'email' | 'datetime' | 'auto-incremental';

interface FieldConfig {
    type?: FieldType,
    itemType?: FieldType,
    required?: FieldRequired,
    defaultValue?: (data: any) => any,
    calculation?: (data: any) => any,
}

export function Field(config: FieldConfig): PropertyDecorator {
    return function (target: Object, propertyKey: string | symbol) {
      Reflect.defineMetadata('fieldConfig', config, target, propertyKey);
    };
  }
  