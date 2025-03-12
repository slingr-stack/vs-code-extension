import * as s from '../../framework/backend/schemas';
import * as m from '../../framework/helpers/models';

export const userSchema = m.model({
    fields: {
        firstName: s.string({
            required: true
        }),
        lastName: s.string({
            required: true
        }),
        fullName: s.string({
            calculation: (user: User) => {
                return `${user.firstName} ${user.lastName}`;
            }
        }),
        email: s.email({
            required: true
        }),
        status: s.enumeration({
            required: true,
            defaultValue: (data: User) => 'active',
            values: ['active', 'inactive'],
        }),
        age: s.number({
            integer: true,
            min: 0,
            max: 150
        }),
        password: s.string({        
            required: true,
            min: 8,
            max: 16
        }),
        notes: s.string({})
    }
});

export type User = s.InferType<typeof userSchema>;
