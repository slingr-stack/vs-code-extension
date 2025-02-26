import { App } from "../framework/app";
import { contactsEntity } from "./model/entities/contacts";
import { contactGridView } from "./ui/views/contactsGrid";

export const app: App = {
    entities: {
        contact: contactsEntity
    },
    views: {
        contactsGrid: contactGridView
    }
}