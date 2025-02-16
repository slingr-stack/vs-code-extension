import { Field } from "./backend";

export class MongoRecord {
    @Field({
        type: 'id'
    })
    id: string;
}

interface CopiedFieldConfig<Source, Target> {
    relationshipField: keyof Source,
    copiedField: keyof Target
}

export function CopiedField<Source, Target>(config: CopiedFieldConfig<Source, Target>): PropertyDecorator {
    return function (target: Object, propertyKey: string | symbol) {
        Reflect.defineMetadata('copiedFieldConfig', config, target, propertyKey);
    };
}
