import 'reflect-metadata';
import { Column, AfterLoad } from 'typeorm';
import { DateTimeRangeType } from '../../model/types/date_time/DateTimeRange';

/**
 * Manages DateTimeRange field persistence using hidden columns approach.
 * 
 * Since DateTimeRange is a complex object with 'from' and 'to' Date fields,
 * we can't use a simple ValueTransformer. Instead, we create hidden columns
 * for each Date component and use entity lifecycle hooks to sync them.
 */
export class DateTimeRangeFieldManager {
    
    /**
     * Configures hidden columns for a DateTimeRange field.
     * Creates two hidden columns: one for 'from' date and one for 'to' date.
     * Also sets up AfterLoad hook to reconstruct DateTimeRange objects.
     * 
     * @param target - The entity prototype
     * @param propertyKey - The DateTimeRange field name
     * @param fieldOptions - DateTimeRange options
     */
    configureFieldColumns(target: any, propertyKey: string, fieldOptions?: any): void {
        const fromColumnName = `${propertyKey}_from`;
        const toColumnName = `${propertyKey}_to`;
        
        // Create hidden 'from' date column
        Column({ 
            type: 'datetime', 
            nullable: true,
            name: fromColumnName
        })(target, fromColumnName);
        
        // Create hidden 'to' date column  
        Column({ 
            type: 'datetime', 
            nullable: true,
            name: toColumnName
        })(target, toColumnName);
        
        // Store metadata about which hidden columns belong to this DateTimeRange field
        Reflect.defineMetadata('dateTimeRange:hiddenColumns', {
            from: fromColumnName,
            to: toColumnName
        }, target, propertyKey);
        
        // Mark this field as using hidden columns approach
        Reflect.defineMetadata('dateTimeRange:usesHiddenColumns', true, target, propertyKey);
        
        // Store this field name in the list of DateTimeRange fields for this entity
        const existingFields = Reflect.getMetadata('dateTimeRange:fields', target) || [];
        if (!existingFields.includes(propertyKey)) {
            existingFields.push(propertyKey);
            Reflect.defineMetadata('dateTimeRange:fields', existingFields, target);
        }
        
        // Add single @AfterLoad hook to automatically reconstruct all DateTimeRange objects
        if (!target['_afterLoadDateTimeRanges']) {
            target['_afterLoadDateTimeRanges'] = function() {
                // Create a single instance of the manager to handle reconstruction
                const manager = new DateTimeRangeFieldManager();
                manager.reconstructDateTimeRangeValues(this);
            };
            
            // Apply @AfterLoad decorator to the method
            AfterLoad()(target, '_afterLoadDateTimeRanges');
        }
    }
    
    /**
     * Extracts DateTimeRange values and populates hidden columns before save.
     * This method should be called in a BeforeInsert/BeforeUpdate subscriber.
     * 
     * @param entity - The entity being saved
     */
    extractDateTimeRangeValues(entity: any): void {
        const constructor = entity.constructor;
        const fields = Reflect.getMetadata('model:fields', constructor) || [];
        
        for (const fieldName of fields) {
            const fieldType = Reflect.getMetadata('field:type', constructor.prototype, fieldName);
            
            if (fieldType === 'datetimerange') {
                const hiddenColumns = Reflect.getMetadata('dateTimeRange:hiddenColumns', constructor.prototype, fieldName);
                
                if (hiddenColumns) {
                    const dateTimeRange = entity[fieldName] as DateTimeRangeType | undefined;
                    
                    if (dateTimeRange) {
                        // Extract from and to dates to hidden columns
                        entity[hiddenColumns.from] = dateTimeRange.from || null;
                        entity[hiddenColumns.to] = dateTimeRange.to || null;
                    } else {
                        // Clear hidden columns if DateTimeRange is null/undefined
                        entity[hiddenColumns.from] = null;
                        entity[hiddenColumns.to] = null;
                    }
                }
            }
        }
    }
    
    /**
     * Reconstructs DateTimeRange objects from hidden columns after load.
     * This method should be called in an AfterLoad subscriber.
     * 
     * @param entity - The entity being loaded
     */
    reconstructDateTimeRangeValues(entity: any): void {
        const constructor = entity.constructor;
        const dateTimeRangeFields = Reflect.getMetadata('dateTimeRange:fields', constructor.prototype) || [];
        
        for (const fieldName of dateTimeRangeFields) {
            const hiddenColumns = Reflect.getMetadata('dateTimeRange:hiddenColumns', constructor.prototype, fieldName);
            
            if (hiddenColumns) {
                const fromDate = entity[hiddenColumns.from];
                const toDate = entity[hiddenColumns.to];
                
                // Only create DateTimeRange if at least one date is present and not null
                if ((fromDate !== null && fromDate !== undefined) || (toDate !== null && toDate !== undefined)) {
                    const dateTimeRange = new DateTimeRangeType();
                    // Convert null to undefined for consistency
                    dateTimeRange.from = fromDate === null ? undefined : fromDate;
                    dateTimeRange.to = toDate === null ? undefined : toDate;
                    entity[fieldName] = dateTimeRange;
                } else {
                    entity[fieldName] = undefined;
                }
                
                // Make hidden column properties non-enumerable so they don't appear 
                // in JSON serialization while preserving them for TypeORM's use
                this.makePropertyNonEnumerable(entity, hiddenColumns.from);
                this.makePropertyNonEnumerable(entity, hiddenColumns.to);
            }
        }
    }
    
    /**
     * Gets the names of hidden columns for a DateTimeRange field.
     * Useful for building custom queries that need to filter by date ranges.
     * 
     * @param target - The entity class or prototype
     * @param propertyKey - The DateTimeRange field name
     * @returns Object with 'from' and 'to' column names, or null if not found
     */
    getHiddenColumnNames(target: any, propertyKey: string): { from: string; to: string } | null {
        return Reflect.getMetadata('dateTimeRange:hiddenColumns', target.prototype || target, propertyKey) || null;
    }
    
    /**
     * Makes a property non-enumerable to hide it from JSON serialization
     * while preserving it for TypeORM operations.
     * 
     * @param object - The object containing the property
     * @param propertyName - The name of the property to make non-enumerable
     */
    private makePropertyNonEnumerable(object: any, propertyName: string): void {
        if (object.hasOwnProperty(propertyName)) {
            const value = object[propertyName];
            Object.defineProperty(object, propertyName, {
                value: value,
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
    }
}
