import * as uuid from 'hap-nodejs/dist/lib/util/uuid';
import {v4 as genuuid} from 'uuid';

export const fromString = uuid.generate;
export const fromBuffer = uuid.unparse;
export const validate = uuid.isValid;

export const generate: () => string = genuuid;

const SHORT_FORM_REGEX = /^0*([0-9a-f]{1,8})-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/**
 * Converts UUIDs to a short form if it matches a base UUID.
 *
 * @param {string} uuid The long UUID
 * @param {string} [base] A base UUID to validate the long UUID matches
 * @return {string} A short UUID if it matches the base UUID, otherwise the uppercased long UUID
 */
export function toShortForm(uuid: string, base?: string) {
    if (!validate(uuid)) throw new TypeError('uuid was not a valid UUID or short form UUID');
    if (base && !validate('00000000' + base)) throw new TypeError('base was not a valid base UUID');
    if (base && !uuid.endsWith(base)) return uuid.toUpperCase();

    return uuid.replace(SHORT_FORM_REGEX, '$1').toUpperCase();
}

const VALID_SHORT_REGEX = /^[0-9a-f]{1,8}$/i;

/**
 * Converts short UUIDs to the long format.
 * If a long UUID is passed it is returned uppercased.
 *
 * @param {string} uuid A long or short UUID
 * @param {string} base The base UUID to add to the short UUID to get the long UUID
 * @return {string} The uppercased long UUID
 */
export function toLongForm(uuid: string, base: string) {
    if (validate(uuid)) return uuid.toUpperCase();
    if (!VALID_SHORT_REGEX.test(uuid)) throw new TypeError('uuid was not a valid UUID or short form UUID');
    if (!validate('00000000' + base)) throw new TypeError('base was not a valid base UUID');

    return (('00000000' + uuid).substr(-8) + base).toUpperCase();
}
