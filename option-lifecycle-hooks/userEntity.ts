class UserEntity extends AbstractEntity {
  
  name: string;
  email: string;
  age: number;
  role: 'admin' | 'user';

  constructor(name: string, email: string, age: number, role: 'admin' | 'user') {
    super();
    this.name = name;
    this.email = email;
    this.age = age;
    this.role = role;
  }

  async beforeCreate() {
    console.log('Before create: Initializing entity...');
  }

  async afterCreate() {
    console.log('After create: Entity created.');
  }

  async beforeUpdate() {
    console.log(`Before update: Updating user ${this.name}`);
  }

  async afterUpdate() {
    console.log(`After update: User ${this.name} updated.`);
  }

  async beforeDelete() {
    console.log(`Before delete: Checking permissions for ${this.name}`);
  }

  async afterDelete() {
    console.log(`After delete: User ${this.name} deleted.`);
  }

  async beforeSave() {
    console.log('Before save: Validating and preparing data...');
  }

  async afterSave() {
    console.log('After save: Changes saved successfully.');
  }

  async validate() {
    if (!this.email.includes('@')) throw new Error('Invalid email address.');
    if (this.age < 18) throw new Error('User must be at least 18 years old.');
  }
  
  async onChange() {
    console.log('On change: User data has been modified.');
  }

  async beforeRead() {
    console.log('Before read: Checking visibility rules...');
    if (this.role !== 'admin') {
      this.email = '[HIDDEN]'; // Hide sensitive data
    }
  }

  async afterRead() {
    console.log('After read: Data successfully retrieved.');
  }
}
