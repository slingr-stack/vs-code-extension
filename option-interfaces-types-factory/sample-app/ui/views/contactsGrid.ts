import { gridColumn, gridView } from "../../../framework/viewFactory";
import { contactEntity } from "../../model/entities/contacts";

export const contactGridView = gridView({
    entity: contactEntity,
    columns: {
        firstName: gridColumn({ field: contactEntity.fields.firstName }),
        lastName: gridColumn({ field: contactEntity.fields.lastName }),
        email: gridColumn({ field: contactEntity.fields.email }),
        company: gridColumn({ field: contactEntity.fields.company })
    }
})
