import { InputStream } from '../../common/input-stream';

/**
 * Parses a buffer containing hash values and yields each hash as a hexadecimal string.
 *
 * @param buffer The buffer containing the hash values.
 * @yields {string} Each hash value as a hexadecimal string.
 *
 * @example
 * ```typescript
 * const buffer = Buffer.from([...]);
 * for (const hash of parseHashes(buffer)) {
 *     console.log(hash);
 * }
 * ```
 */
export function* parseHashes(buffer: Buffer): Iterable<string> {
    const stream = new InputStream(buffer);
    const hashSize = stream.getUint16();
    console.assert(hashSize % 4 === 0);
    const version = stream.getUint16();
    const count = stream.getUint16();
    for (let i = 1; i <= count; i++) {
        yield buffer.toString('hex', i * hashSize, (i + 1) * hashSize);
    }
}