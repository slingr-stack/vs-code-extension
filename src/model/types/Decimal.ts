import 'reflect-metadata';
import { registerDecorator } from 'class-validator';
import { Money, Round } from 'bigint-money';
import { Transform } from 'class-transformer';

export type Decimal = Money;

export interface DecimalOptions {
    decimals: number;
    roundingType: 'truncate' | 'roundHalfToEven' | 'roundAwayFromZero' | 'roundHalfTowardsZero' | 'Error';
    min?: string;
    max?: string;
    positive?: boolean;
    negative?: boolean;
}

/**
 * Mapea nuestro string de roundingType a la enumeración de la librería bigint-money.
 */
function getRoundingMode(roundingType: DecimalOptions['roundingType']): Round | undefined {
    switch (roundingType) {
        case 'truncate':
            return Round.TRUNCATE;
        case 'roundHalfToEven':
            return Round.BANKERS;
        //case 'roundAwayFromZero':
        //    return Round.AWAY_FROM_0;
        case 'roundHalfTowardsZero':
            return Round.HALF_TOWARDS_0;
        default:
            return undefined; // Para 'Error' u otros casos
    }
}

// El alias `DecimalKey` asegura que el decorador solo se aplique a propiedades del tipo `Decimal`.
type DecimalKey<T, K extends keyof T & string> = T[K] extends Decimal | undefined | null ? K : `Decimal: requires a property of type 'Decimal'`;

function validateDecimalType(proto: Object, propertyKey: string): void {
    const designType = Reflect.getMetadata('design:type', proto, propertyKey);
    if (designType && designType !== Object && designType.name !== 'Decimal') {
        throw new Error(`@Decimal can only be applied to properties of type 'Decimal', but it was used on '${propertyKey}' which is of type '${designType?.name}'.`);
    }
}

function storeDecimalMetadata(proto: Object, propName: string, options: DecimalOptions): void {
    Reflect.defineMetadata('field:type', 'decimal', proto, propName);
    Reflect.defineMetadata('field:type:options', options, proto, propName);
}

function createOptionalValidatorAdder(proto: Object, propName: string) {
    return (name: string, validate: (value: unknown) => boolean, defaultMessage: string) => {
        registerDecorator({
            name,
            target: (proto as any).constructor,
            propertyName: propName,
            validator: {
                validate(value: unknown) {
                    if (value === undefined || value === null) return true;
                    return validate(value);
                },
                defaultMessage() { return defaultMessage; },
            },
        });
    };
}

function applyDecimalValidations(
    addOptionalValidator: ReturnType<typeof createOptionalValidatorAdder>,
    propName: string,
    options: DecimalOptions
): void {
    addOptionalValidator('isDecimal', (v) => v instanceof Money, `${propName} must be a Decimal object`);

    if (options.positive) {
        addOptionalValidator('isPositive', (v) => v instanceof Money && v.isGreaterThan('0'), `${propName} must be a positive amount`);
    }
    if (options.negative) {
        addOptionalValidator('isNegative', (v) => v instanceof Money && v.isLesserThan('0'), `${propName} must be a negative amount`);
    }
    if (options.min) {
        addOptionalValidator('min', (v) => v instanceof Money && v.isGreaterThanOrEqual(options.min!), `${propName} must not be less than ${options.min}`);
    }
    if (options.max) {
        addOptionalValidator('max', (v) => v instanceof Money && v.isLesserThanOrEqual(options.max!), `${propName} must not be greater than ${options.max}`);
    }
}

export function Decimal(options: DecimalOptions) {
    return function <T extends Object, K extends keyof T & string>(target: T, propertyKey: DecimalKey<T, K>) {
        const propName = propertyKey as string;
        const proto = target as Object;

        validateDecimalType(proto, propName);
        storeDecimalMetadata(proto, propName, options);

        Transform(({ value, key, obj, type }) => {
            const opts = Reflect.getMetadata('field:type:options', obj, key) as DecimalOptions;
            if (!opts) return value;

            // --- Deserialización: plainToClass (fromJSON) ---
            if (type === 1) {
                if (typeof value !== 'string' && typeof value !== 'number') {
                    return value;
                }

                const stringValue = String(value);

                // Validación para roundingType: 'Error'
                if (opts.roundingType === 'Error') {
                    const decimalPart = stringValue.split('.')[1] || '';
                    if (decimalPart.length > opts.decimals) {
                        // Devuelve un valor inválido para que la validación 'isDecimal' falle
                        return `Invalid decimal places for ${key}. Expected ${opts.decimals}, but got ${decimalPart.length}.`;
                    }
                }

                try {
                    // Creamos el objeto Money. La librería maneja el parseo.
                    // El redondeo se aplica en el constructor si se especifica.
                    const roundingMode = getRoundingMode(opts.roundingType);
                    const moneyValue = new Money(stringValue, 'XXX', roundingMode);

                    // La librería trabaja con alta precisión interna. El formateo final se hace en toFixed.
                    // Aquí solo nos aseguramos de que el objeto se cree correctamente.
                    return moneyValue;
                } catch (error) {
                    return value; // Dejar que la validación falle si hay un error de parseo
                }
            }

            // --- Serialización: classToPlain (toJSON) ---
            if (type === 0) {
                if (value instanceof Money) {
                    // Usamos toFixed() para formatear la salida con la precisión correcta
                    return value.toFixed(opts.decimals);
                }
            }

            return value;
        })(target, propName);

        const addOptionalValidator = createOptionalValidatorAdder(proto, propName);
        applyDecimalValidations(addOptionalValidator, propName, options);
    };
}