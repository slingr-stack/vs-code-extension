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
    protected abstract validate(): Promise<void> | void;
    protected abstract onChange(): Promise<void> | void;

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

    async read() {
        await this.beforeRead();
        // read logic
        await this.afterRead();
    }

    async delete() {
        await this.beforeDelete();
        // delete logic
        await this.afterDelete();
    }


}
