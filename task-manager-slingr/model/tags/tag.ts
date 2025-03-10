import { model as m, types as t, widgets as w, ui, mongo } from 'slingr';

export const tagSchema = m.schema({
    name: t.text({
        required: true
    }),
    description: t.longText()
});

export type Tag = m.infer<typeof tagSchema>;

ui.defaultUiForSchema<Tag>({
    label: 'Tags',
    instanceLabelField: 'name',
    sorting: {
        field: 'name',
        direction: 'asc'
    },
    fields: {
        name: ui.fields.text({
            label: 'Name',
        }),
        description: ui.fields.textArea({
            label: 'Description'
        })
    }
});

export const tagRepository = mongo.repositoryForSchema<Tag>({
    collectionName: 'tags',
    managed: true,
    indexes: [
        mongo.regularIndex(['name'])
    ]
});
