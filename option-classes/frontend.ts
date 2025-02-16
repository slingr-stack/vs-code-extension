interface DataModelUISettingsConfig<T> {
    defaultLabel: keyof T
}

export function DataModelUISettings<T>(config: DataModelUISettingsConfig<T>): PropertyDecorator {
    return function (target: Object, propertyKey: string | symbol) {
        Reflect.defineMetadata('dataModelUISettingsConfig', config, target, propertyKey);
    };
}

