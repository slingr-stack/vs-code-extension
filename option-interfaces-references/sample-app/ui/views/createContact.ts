import { FormView } from "../../../framework/metadata/formView";
import { ContactsEntity as contactsEntity, emailField, firstNameField, fullNameField, lastNameField } from "../../model/entities/contacts";

export const createContactView: FormView = {
    label: 'Create contact',
    name: 'createContact',
    entity: contactsEntity,
    managed: false,
    fields: [{ field: firstNameField }, { field: lastNameField }, { field: fullNameField, readOnly: true }, { field: emailField }]
};