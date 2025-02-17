interface DataModelUISettingsConfig<T> {
    defaultLabel: keyof T
}

export function DataModelUISettings<T>(config: DataModelUISettingsConfig<T>): ClassDecorator {
    return function (target: Object) {
        Reflect.defineMetadata('dataModelUISettingsConfig', config, target);
    };
}

