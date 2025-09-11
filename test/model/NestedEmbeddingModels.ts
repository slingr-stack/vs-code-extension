import { BaseModel, Embedded, Field, Model, PersistentModel, Text } from '../../src/model';

@Model()
export class GeoLocation extends BaseModel {
    @Field({ required: true })
    @Text()
    lat!: string;

    @Field({ required: true })
    @Text()
    lng!: string;
}

@Model()
export class Address extends BaseModel {
    @Field({ required: true })
    @Text()
    street!: string;

    @Field({ required: true })
    @Text()
    city!: string;

    @Embedded()
    geo!: GeoLocation;
}

@Model()
export class Person extends PersistentModel {
    @Field({ required: true }) 
    @Text()
    name!: string;

    @Embedded()
    address!: Address;
}

// More complex nested embedding models for testing

@Model()
export class ContactInfo extends BaseModel {
    @Field()
    @Text()
    email!: string;

    @Field()
    @Text()
    phone!: string;
}

@Model()
export class Department extends BaseModel {
    @Field()
    @Text()
    name!: string;

    @Field()
    @Text()
    code!: string;

    @Embedded()
    location!: Address; // Nested: Department -> Address -> GeoLocation
}

@Model()
export class Company extends BaseModel {
    @Field()
    @Text()
    name!: string;

    @Embedded()
    headquarters!: Address; // Nested: Company -> Address -> GeoLocation
    
    @Embedded()
    contact!: ContactInfo;
}

@Model()
export class Employee extends PersistentModel {
    @Field()
    @Text()
    name!: string;

    @Field()
    @Text()
    employeeId!: string;

    @Embedded()
    personalAddress!: Address; // Nested: Employee -> Address -> GeoLocation

    @Embedded()
    department!: Department; // Nested: Employee -> Department -> Address -> GeoLocation

    @Embedded()
    company!: Company; // Nested: Employee -> Company -> (Address, ContactInfo) -> GeoLocation

    @Embedded()
    emergencyContact!: ContactInfo;
}