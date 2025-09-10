import { Field, Model, PersistentModel, Text, HTML, Email } from '../../index';

@Model({
    docs: "Represents a blog post with array fields",
})
export class BlogPost extends PersistentModel {
    @Field({
        required: true,
    })
    @Text({
        minLength: 1,
        maxLength: 200,
    })
    title!: string;

    @Field({
        required: true,
    })
    @HTML()
    content!: string;

    @Field({
        required: false
    })
    @Text({
        minLength: 1,
        maxLength: 50
    })
    tags!: string[];

    @Field({
        required: false
    })
    @HTML()
    notes!: string[];

    @Field({
        required: false
    })
    @Email()
    collaboratorEmails!: string[];
}
