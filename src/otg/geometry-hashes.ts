import { InputStream } from '../common/input-stream';

export function *parseGeometryHashes(buffer: Buffer): Iterable<string> {
    const stream = new InputStream(buffer);
    const hashSize = stream.getUint16();
    console.assert(hashSize % 4 === 0);
    const version = stream.getUint16();
    const count = stream.getUint16();

    for (let i = 1; i <= count; i++) {
        yield buffer.toString('hex', i * hashSize, (i + 1) * hashSize);
    }
}
