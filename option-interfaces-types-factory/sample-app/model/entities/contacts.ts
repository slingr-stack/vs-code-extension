import { Entity } from "../../../framework/entity";
import { relationship, text } from "../../../framework/types";

const contactEntity: Entity = {
    label: 'Contact',
    name: 'contact',
    fields: {
        firstName: text({
            label: 'First Name',
            name: 'firstName',
            rules: { required: true, maxLength: 50 }
        }),
        lastName: text({
            label: 'Last Name',
            name: 'lastName',
            rules: { required: true, maxLength: 50 }
        }),
        email: text({
            label: 'Email',
            name: 'email',
            rules: { required: true, maxLength: 100 }
        }),
        phoneNumbers: text({
            label: 'Phone Numbers',
            name: 'phoneNumbers',
            multiplicity: 'many'
        }),
        company: relationship({
            label: 'Company',
            name: 'company',
            entity: 'company'
        })
    }
};
