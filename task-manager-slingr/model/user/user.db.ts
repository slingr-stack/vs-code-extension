import { User, userSchema } from "./user.schema";
import * as mongo from '../../framework/backend/mongo';
import * as api from '../../framework/backend/api';

export const userRepository = mongo.repositoryForSchema<User>({
    name: 'users',
    managed: true,
    indexes: [
        mongo.indexes.regular<User>(['email']),
        mongo.indexes.regular<User>(['fullName'])
    ],
    encrypt: ['password']
});

api.addSchema(userSchema, userRepository);