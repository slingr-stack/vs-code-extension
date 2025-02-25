import { entity } from "../../../framework/factories/entityFactory";
import { relationship, text } from "../../../framework/factories/typesFactory";


export const contactsEntity = entity({
    label: 'Contacts',
    name: 'contacts',
    fields: {
        firstName: text({ label: 'First Name', name: 'firstName', rules: { required: true } }),
        lastName: text({ label: 'Last Name', name: 'lastName', rules: { required: true } }),
        email: text({ label: 'Email', name: 'email', rules: { required: true } }),
        company: relationship({ label: 'Company', name: 'company', entity: 'companies' })
    }
});