import { ValueTransformer } from 'typeorm';
import number, { FinancialNumber, RoundingStrategy } from 'financial-number';
import { DateTimeRangeType } from '../../model/types/date_time/DateTimeRange';

/**
 * TypeORM ValueTransformer for DateTimeRangeType objects.
 * Converts between DateTimeRangeType objects and database JSON strings.
 */
export class DateTimeRangeTransformer implements ValueTransformer {
    /**
     * Transforms DateTimeRangeType to database value (JSON string).
     * @param value - DateTimeRangeType instance
     * @returns JSON string representation for database storage
     */
    to(value: DateTimeRangeType | null | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        if (!(value instanceof DateTimeRangeType)) {
            console.warn('DateTimeRangeTransformer.to() received non-DateTimeRangeType value:', value);
            return null;
        }

        try {
            return JSON.stringify({
                from: value.from ? value.from.toISOString() : undefined,
                to: value.to ? value.to.toISOString() : undefined
            });
        } catch (error) {
            console.warn('Failed to serialize DateTimeRangeType to JSON:', error);
            return null;
        }
    }

    /**
     * Transforms database value (JSON string) to DateTimeRangeType.
     * @param value - Database JSON string value
     * @returns DateTimeRangeType instance or undefined
     */
    from(value: string | null | undefined): DateTimeRangeType | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        try {
            const data = JSON.parse(value);
            const range = new DateTimeRangeType();
            
            if (data.from) {
                range.from = new Date(data.from);
            }
            
            if (data.to) {
                range.to = new Date(data.to);
            }
            
            return range;
        } catch (error) {
            console.warn(`Failed to parse DateTimeRangeType from database value: ${value}`, error);
            return undefined;
        }
    }
}

/**
 * Default singleton instance of the DateTimeRange transformer.
 */
export const dateTimeRangeTransformer = new DateTimeRangeTransformer();

/**
 * TypeORM ValueTransformer for Decimal/Money types.
 * Converts between FinancialNumber objects and database decimal strings.
 */
export class FinancialNumberTransformer implements ValueTransformer {
    private decimals: number;
    private roundingStrategy: RoundingStrategy;

    constructor(decimals: number = 2, roundingType: 'truncate' | 'roundHalfToEven' = 'truncate') {
        this.decimals = decimals;
        this.roundingStrategy = roundingType === 'truncate' ? number.trim : number.round;
    }

    /**
     * Transforms FinancialNumber to database value (string).
     * @param value - FinancialNumber instance
     * @returns String representation for database storage
     */
    to(value: FinancialNumber | null | undefined): string | null {
        if (value === null || value === undefined) {
            return null;
        }

        if (typeof value === 'object' && value !== null && 'toString' in value) {
            return value.toString(this.decimals, this.roundingStrategy);
        }

        // Fallback for edge cases - create a new FinancialNumber and format it
        try {
            const fn = number(String(value));
            return fn.toString(this.decimals, this.roundingStrategy);
        } catch (error) {
            console.warn(`Failed to convert FinancialNumber to string for value: ${value}`, error);
            return String(value);
        }
    }

    /**
     * Transforms database value (string/number) to FinancialNumber.
     * @param value - Database value (typically a string or number)
     * @returns FinancialNumber instance or undefined
     */
    from(value: string | number | null | undefined): FinancialNumber | undefined {
        if (value === null || value === undefined) {
            return undefined;
        }

        try {
            const fn = number(String(value));
            // Apply the configured precision and rounding
            const formatted = fn.toString(this.decimals, this.roundingStrategy);
            return number(formatted);
        } catch (error) {
            console.warn(`Failed to parse FinancialNumber from database value: ${value}`, error);
            return undefined;
        }
    }
}

/**
 * Creates a FinancialNumber transformer with specific configuration.
 * @param decimals - Number of decimal places
 * @param roundingType - Rounding strategy
 * @returns Configured transformer instance
 */
export function createFinancialNumberTransformer(
    decimals: number = 2,
    roundingType: 'truncate' | 'roundHalfToEven' = 'truncate'
): FinancialNumberTransformer {
    return new FinancialNumberTransformer(decimals, roundingType);
}

/**
 * Default singleton instance of the FinancialNumber transformer.
 * Uses 2 decimal places and truncate rounding.
 */
export const financialNumberTransformer = new FinancialNumberTransformer();
