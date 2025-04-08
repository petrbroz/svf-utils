import { InputStream } from '../../common/input-stream';

export interface Fragment {
    geomId: number;
    materialId: number;
    dbId: number;
    flags: number;
    transform: Transform;
}

export interface Transform {
    translation: Vec3;
    quaternion: Quaternion;
    scale: Vec3;
}

export interface Quaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Vec2 {
    x: number;
    y: number;
}

/**
 * Parses fragments from a given buffer and yields them as an iterable of Fragment objects.
 *
 * @param buffer The buffer containing the fragment data.
 * @param fragmentOffset An optional offset to apply to the fragment's translation. Defaults to { x: 0, y: 0, z: 0 }.
 * @yields An iterable of IFragment objects.
 *
 * @remarks
 * The function reads the buffer using an InputStream, extracts fragment data, and applies the given offset to the translation.
 * The buffer is expected to have a specific structure, with each fragment's data being read in a loop until the end of the buffer is reached.
 *
 * @example
 * ```typescript
 * const buffer = getBufferFromSomeSource();
 * const fragmentOffset = { x: 10, y: 20, z: 30 };
 * for (const fragment of parseFragments(buffer, fragmentOffset)) {
 *     console.log(fragment);
 * }
 * ```
 */
export function* parseFragments(buffer: Buffer, fragmentOffset: Vec3 = { x: 0, y: 0, z: 0 }): Iterable<Fragment> {
    const stream = new InputStream(buffer);
    const byteStride = stream.getUint16();
    console.assert(byteStride % 4 === 0);
    const version = stream.getUint16();
    const chunk = new Uint8Array(byteStride);
    const floats = new Float32Array(chunk.buffer);
    const uints = new Uint32Array(chunk.buffer);
    stream.seek(byteStride);
    while (stream.offset < stream.length - 1) {
        for (let i = 0; i < chunk.length; i++) {
            chunk[i] = stream.getUint8();
        }
        yield {
            geomId: uints[0],
            materialId: uints[1] - 1,
            dbId: uints[2],
            flags: uints[3],
            transform: {
                translation: {
                    x: floats[4] + fragmentOffset.x,
                    y: floats[5] + fragmentOffset.y,
                    z: floats[6] + fragmentOffset.z,
                },
                quaternion: {
                    x: floats[7],
                    y: floats[8],
                    z: floats[9],
                    w: floats[10],
                },
                scale: {
                    x: floats[11],
                    y: floats[12],
                    z: floats[13],
                }
            }
        };
    }
}