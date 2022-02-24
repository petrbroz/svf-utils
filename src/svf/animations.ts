import { IAnimations } from './schema';

/**
 * Parses SVF animations.
 * @param {Buffer} buffer Binary buffer to parse.
 * @returns {IAnimations | null} Parsed animations.
 */
export function parseAnimations(buffer: Buffer): IAnimations | null {
    if (buffer.byteLength > 0) {
        return JSON.parse(buffer.toString()) as IAnimations;
    } else {
        return null;
    }
}
