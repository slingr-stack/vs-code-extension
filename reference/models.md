# Models

Models are a way to define a rich data structure. By "rich" we mean it holds more information than just the fields and the data type. For example, a model can contain information about how a field is calculated, database settings, display options, validation rules, etc. Slingr is a model-driven development framework and for that reason a lot of the information is going to sit in this layer.

A generic model needs to be able to support the following features:

- Data structure
- Types
  - Specifc rules for the types
- Validations
- Default values
- Calculated values
- Access
- Relationships (one-to-one, one-to-many, many-to-many)

## Defining a model

This is a simple model:

```ts
@Model()
class Person {
  @Field()
  firstName: string;

  @Field()
  lastName: string;

  @Field()
  email: string;
}
```

In this case, Typescript types will be mapped to default data types. Also, the decorator `Field` is not mandatory. We put it in the example to make it explicit, but it is not needed if you don't want to specify settings.

## Default label for instances

Models can have instances and it is good to have a way to identify these instances. They can be used when logging information or when the UI needs to show something.

OPTION 1: In this case, we have a property in the model settings to indicate a field or a calculation. I think this approach has some problems like the lack of type safety (maybe we can achieve validation using some complex types definition) and it will also need a new field that doesn't exist, which is what happens today in the platform.
```ts
@Model({
  instanceLabel: (person: Person) => { `${person.firstName} ${person.lastName} <${person.email}>` }
})
class Person {
  @Field({
    required: true
  })
  firstName: string;

  @Field({
    required: true
  })
  lastName: string;

  @Field({
    required: true
  })
  email: string;
}
```

OPTION 2: The benefit in this approach is you explicitly define the label field (you can name however you want or use another field that is not calculated). It is simple for developers and AI. The downside is that you use another decorator and you have to validate it. The problem of the additional validator could be solved by adding it as a setting of the field, but could be confusing as well.
```ts
@Model()
class Person {
  @Field({
    calculation: (person: Person) => { `${person.firstName} ${person.lastName} <${person.email}>` }
  })
  @InstanceLabel()
  label: string;
  
  @Field({
    required: true
  })
  firstName: string;

  @Field({
    required: true
  })
  lastName: string;

  @Field({
    required: true
  })
  email: string;
}
```

OPTION 3: In this case we use the default `toString()`. It has the advantage that is a known things in Typescript and will work when you are logging the value, for example. The problem is that we should create a field that is not visible if we want to persist it, and we are calculating it all the time.
```ts
@Model()
class Person {
  @Field({
    required: true
  })
  firstName: string;

  @Field({
    required: true
  })
  lastName: string;

  @Field({
    required: true
  })
  email: string;

  toString(): string {
    return `${this.firstName} ${this.lastName} <${this.email}>`;
  }
}
```

COMMENTS: Probably we can use option #2 and automatically implement #3 so we get the benefit of it.

## Required fields

You can define a field is required like this:

```ts
@Model()
class Person {
  @Field({
    required: true
  })
  firstName: string;

  @Field({
    required: true
  })
  lastName: string;

  @Field({
    required: true
  })
  email: string;
}
```

It is possible that a field is required based on a condition:

```ts
@Model()
class Task {
  @Field({
    required: true
  })
  title: string;

  @Field({
    required: true
  })
  type: Type;

  @Field({
    required: (task: Task) => { task.type == Type.Story }
  })
  priority: Priority;
}
```

In this case, the field `priority` is only required if the `type` is `Story`.

## Default values

Default values can be specified by initializing the field:

```ts
@Model()
class Task {
  @Field({
    required: true
  })
  title: string;

  @Field({
    required: true
  })
  type: Type = Type.Story;
}
```

Sometimes, default values can be more complex and are based on a script. In these cases, you should provide a script like this:

OPTION 1: This has less "magic", but it is intuitive for developers and AI. The problem is that you get the default value separated from the field declaration.
```ts
@Model()
class Task {
  @Field({
    required: true
  })
  title: string;

  @Field({
    required: true
  })
  type: Type;

  constructor() {
    if (someCondition()) {
      type = Type.Release;
    } else {
      type = Type.Story;
    }
  }
}
```

OPTION 2: Here you define an anonymous function. It is trickier but OK for more experienced developers and AI. You can reference `this` but it will be executed in the order the object is initialized. I think it will be a problem if we have to 
```ts
@Model()
class Task {
  @Field({
    required: true
  })
  title: string;

  @Field({
    required: true
  })
  type: Type = (() =? {
    if (someCondition()) {
      return Type.Release;
    } else {
      return Type.Story;
    }
  })();
}
```

OPTION 3: In this case, we define how the default value has to be handled. It doesn't follow what would be intuitive for any Typescript developer or AI, however, it has the advantage that we can control when to call it. For example, we might want to do some initialization of the instance before calling the default value (maybe setting some realtionships or something like that).
```ts
@Model()
class Task {
  @Field({
    required: true
  })
  title: string;

  @Field({
    required: true,
    defaultValue: (task: Task) => {
      if (someCondition()) {
        return Type.Release;
      } else {
        return Type.Story;
      }
    }
  })
  type: Type;
}
```

COMMENTS: IF we go with option 3, probably we also want to define default values this way even when it is a value so we can control when to call it and be more consistent.

## Calculated fields

COMMENTS: I put a different options here. I think it would be useful to define if we want a field to be calculated every time you call it or if you want to calculate it once and then just return the value. The problem in the second approach is that you need to define when you are going to calculate it again. Today, in our platoform, we do it when you save the record.

OPTION 1: In this case, the calculated field is always calculated when you ask for its value. It is simple and uses languages' features, but it might be inefficient if the calcultion is expensive.
```ts
@Model()
class LineItem {
  @Field()
  price: number;

  @Field()
  quantity: number;

  @Field()
  get total(): number {
    return this.price * this.quantity;
  }
}
```

OPTION 2: In this case, we define how to calculate it, but we can have more control on when we want to call it. Maybe the developer wants to call it manually in some cases, the UI can refresh it when needed, when we detect changes in other fields, etc. It might be tricky for the developer to understand when it is going to be calculated.
```ts
@Model()
class LineItem {
  @Field()
  price: number;

  @Field()
  quantity: number;

  @Field({
    calculation: (lineItem: LineItem) => {
      return lineItem.price * lineItem.quantity;
    }
  })
  total: number;
}
```

## Validations

Apart from common validations defined in the `Field` decorator or in type-specific decorators (like `maxLength` in the `Text` decorator), you might have custom validations in a field.

```ts
@Model()
class LineItem {
  @Field()
  product: Product;

  @Field()
  price: number;

  @Field({
    validation: (value: number, lineItem: LineItem) => {
      let errors = [];
      if (lineItem.product?.limited && value > 5) {
        erros.push({code: 'overLimit', message: `The maximum quantity for limited products is 5`});
      }
      return errors;
    }
  })
  quantity: number;

  @Field({
    calculation: (lineItem: LineItem) => {
      return lineItem.price * lineItem.quantity;
    }
  })
  total: number;
}
```

Also, you might have a validation that is global for the whole model:

COMMENTS: I think here we shouldn't allow setting a field because we should use it only for case where the validation error is global to the model. This will avoid setting a string in the `field` field, which breaks type safety. Maybe I'm missing use cases, but let's talk about it.

```ts
@Model({
  validation: (passwordChange: PasswordChange) => {
    let errors = [];
    if (passwordChange.newPassword != passwordChange.confirmNewPassword) {
      errors.push({code: 'doesNotMatch', message: 'New password and the confirmation do not match'});
    }
    return errors;
  }
})
class PasswordChange {
  @Field()
  oldPassword: string;

  @Field()
  newPassword: string;

  @Field()
  confirmNewPassword: string;
}
```

## Access

TODO: At the model level, this doesn't seem to make much sense. I mean, we can set a field is read-only, but you can go ahead and set it in the model, nothing will prevent it from happening. Maybe, in the serialization is where we can take this into account. For example, we you do `JSON.stringify(instance)`, then you will get the version without the fields that shouldn't be there, or a custom method like `clean()` that takes out things that aren't available. I'm not sure. I see this feature makes sense when we add an API or persisntance, but it doesn't seem to make much sense at the model level.

## Serialization

TODO: We might think about overriding `toJSON()` and take into account the access settings and maybe some other things like permissiosn in the future.

# Data types

The following data types will be supported in the framework:

- Text (string)
  - LongText *
  - Email
  - Phone *
  - HTML
  - URL *
  - MaskedText *
    - Date *
    - Time *
- Number (number)
  - Integer
    - TimeDuration *
  - PrecisionNumber *
  - Money
  - Percentage *
- Date/Time (Date)
- DateRange (DateRange) *
- Boolean (boolean)
- Choice (Enum)
- DynamicChoice (NameValuePair)

* We put them here for reference, but won't be implemented initially.

You can see there is a hierarchy of types. This is because one type builds on top of the other one. For example, the `Email` type is a `Text` type where there is a regex to validate it is an email.

Also, you can see there are non-standard data types in some cases, like `DateRange` or `NameValuePair`. These are classes that will be inside the model.

We want to make it easier to add new types, so it is extensible. New types will add more information in the model that could be useful for other layers, even if they are very similar to other ones.

## Explicit definition of data types in models

You can explicitly indicate the data type in the model and set type-specific settings:

```ts
@Model()
class Person {
  @Field()
  @Text({
    maxLength: 30
  })
  firstName: string;

  @Field()
  @Text({
    maxLength: 30
  })
  lastName: string;

  @Field()
  @Email()
  email: string;
}
```

As you can see, a new decorator is used to define the type. This is because defining the type inside the `Field` decorator was going to cause that we had to add all the type-specific options there, making it too big and also won't be align with the goal of making types easily extensible.

# Multi-valued fields

TODO

# Relationships

TODO

# Implementation notes

TODO: Put some notes about that implementation that will be useful for the implementation team.