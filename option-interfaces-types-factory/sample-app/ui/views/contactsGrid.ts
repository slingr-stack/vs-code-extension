import { gridColumn, gridView } from "../../../framework/factories/viewFactory";
import { contactsEntity } from "../../model/entities/contacts";

export const contactGridView = gridView({
    entity: contactsEntity,
    columns: {
        firstName: gridColumn({ field: contactsEntity.fields.firstName }),
        lastName: gridColumn({ field: contactsEntity.fields.lastName }),
        email: gridColumn({ field: contactsEntity.fields.email }),
        company: gridColumn({ field: contactsEntity.fields.company })
    }
})
