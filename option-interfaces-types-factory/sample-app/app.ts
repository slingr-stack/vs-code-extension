import { App } from "../framework/app";
import { contactEntity } from "./model/entities/contacts";
import { contactGridView } from "./ui/views/contactsGrid";

export const app: App = {
    entities: {
        contact: contactEntity
    },
    views: {
        contactsGrid: contactGridView
    }
}