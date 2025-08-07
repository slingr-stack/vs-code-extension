# Models

Models are a way to define a rich data structure. By "rich" we mean it holds more information than just the fields and the data type. For example, a model can contain information about how a field is calculated, database settings, display options, validation rules, etc. Slingr is a model-driven development framework and for that reason a lot of the information is going to sit in this layer.

A generic model needs to be able to support the following features:

- Data structure
- Types
  - Specifc rules for the types
- Validations
- Default values
- Calculated values
- Availability
- Relationships (one-to-one, one-to-many, many-to-many)

# Defining a model

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

In this case, Typescipt types will be mapped to default data types. Also, the decorator `Field` is not mandatory. We put it in the example to make it explicit, but it is not needed if you don't want to specify settings.

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
    required: (task: Task) => {
      return task.type == Type.Story;
    }
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

## Calculated fields

TBD: Think more about this

Sometimes you want some fields to be calculated. This means you will never want to set these values but instead they are calculated. The most simple scenario is for a field that is always calculated on the fly when requested:

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

In this case, the field will be calculated every time you ask for it.

However, in some situations you don't want to recalculate it all the time. Instead, you want to calculate it on specific events. In this case, you will define the calculation in a different way:

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

In this case, the system will determine when it has to be calculated. It will try to recalculate it only when something changes in the model that will impact it. Later, the calculated value will be stored and you can access it normally.

The first way is used when the calculation is very simple and you want to make sure it is always up-to-date. The second option is better when the calculation is expensive and you are going to call it many times to know the value without changing the dependencies. 

## Validations

TBD

# Data types

The following data types will be supported in the framework (at least initially):

- Text (string)
  - LongText
  - Email
  - Phone
  - HTML
  - URL
  - MaskedText
    - Date
    - Time
- Number (number)
  - Integer
    - TimeDuration
  - PrecisionNumber
  - Money
  - Percentage
- Date/Time (Date)
- DateRange (DateRange)
- Boolean (boolean)
- Choice (Enum)
- DynamicChoice (NameValuePair)

You can see there is a hierarchy of types. This is because one type builds on top of the other one. For example, the `Email` type is a `Text` type where there is a regex to validate it is an email.

Also, you can see there are non-standard data types in some cases, like `DateRange` or `NameValuePair`. These are classes that will be inside the model.

We want to make it easier to add new types, so it is extensible. New types will add more information in the model that could be useful for other layers, even if they are very similar to other ones.

## Explicit definition of data types in models

You can explicitly indicate the data type in the model:

```ts
@Model()
class Person {
  @Text()
  firstName: string;

  @Text()
  lastName: string;

  @Email()
  email: string;
}
```