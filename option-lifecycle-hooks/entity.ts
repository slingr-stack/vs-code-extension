abstract class AbstractEntity {
    id?: string;
    createdAt?: Date;
    updatedAt?: Date;
  
    constructor() {
      this.createdAt = new Date();
    }
  
    // lifecycle hooks
    protected abstract beforeSave(): Promise<void> | void;
    protected abstract afterSave(): Promise<void> | void;
    protected abstract beforeRead(): Promise<void> | void;
    protected abstract afterRead(): Promise<void> | void;
    protected abstract beforeDelete(): Promise<void> | void;
    protected abstract afterDelete(): Promise<void> | void;
    protected abstract beforeValidate(): Promise<void> | void;
    protected abstract afterValidate(): Promise<void> | void;
  
    async save() {
      await this.beforeSave();
      if (!this.id) {
        this.id = Math.random().toString(36).substr(2, 9); // Simulate ID generation
      } else {
        this.updatedAt = new Date();
      }
      // save logic
      await this.afterSave();
    }
  
    async delete() {
      await this.beforeDelete();
      // delete logic
      await this.afterDelete();
    }
  
    async validate() {
      await this.beforeValidate();
      // validate logic
      await this.afterValidate();
    }
  
    async read() {
      await this.beforeRead();
      // read logic
      await this.afterRead();
    }
  }
  