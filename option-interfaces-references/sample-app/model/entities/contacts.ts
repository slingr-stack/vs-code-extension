import { Entity } from "../../../framework/metadata/entity";
import { Field } from "../../../framework/metadata/field";

export const firstNameField: Field = { label: 'First Name', name: 'firstName', type: 'text' };
export const lastNameField: Field = { label: 'Last Name', name: 'lastName', type: 'text' };
export const fullNameField: Field = { label: 'Full Name', name: 'fullName', type: 'text', calculation: () => 'return null;' };
export const emailField: Field = { label: 'Email', name: 'email', type: 'text' };
export const phoneNumberField: Field = { label: 'Phone Number', name: 'phoneNumber', type: 'text' };

export const ContactsEntity: Entity = {
  label: 'Contacts',
  name: 'contacts',
  fields: [firstNameField, lastNameField, fullNameField, emailField, phoneNumberField]
};