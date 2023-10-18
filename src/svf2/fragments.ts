import { InputStream } from '../common/input-stream';

interface IVec3 {
    x: number;
    y: number;
    z: number;
}

interface IQuaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

interface IOtgTransform {
    translation: IVec3;
    quaternion: IQuaternion;
    scale: IVec3;
}

interface IOtgFragment {
    geomId: number;
    materialId: number;
    dbId: number;
    flags: number;
    transform: IOtgTransform;
}

/**
 * Parses fragments from a binary buffer, typically stored in a file called 'fragments.fl'.
 * @generator
 * @param {Buffer} buffer Binary buffer to parse.
 * @param {object}
 * @returns {Iterable<IOtgFragment>} Instances of parsed fragments.
 */
export function *parseFragments(buffer: Buffer, fragmentOffset: IVec3 = { x: 0, y: 0, z: 0 }): Iterable<IOtgFragment> {
    const stream = new InputStream(buffer);
    const byteStride = stream.getUint16();
    console.assert(byteStride % 4 === 0);
    const version = stream.getUint16();

    let bdata = new Uint8Array(byteStride);
    let fdata = new Float32Array(bdata.buffer);
    let idata = new Uint32Array(bdata.buffer);

    stream.seek(byteStride);
    while (stream.offset < stream.length - 1) {
        for (let i = 0; i < bdata.length; i++) {
            bdata[i] = stream.getUint8();
        }
        const geomId = idata[0];
		const materialId = idata[1] - 1;
		const dbId = idata[2];
        const flags = idata[3];
        const translation: IVec3 = { x: fdata[4] + fragmentOffset.x, y: fdata[5] + fragmentOffset.y, z: fdata[6] + fragmentOffset.z };
        const quaternion = { x: fdata[7], y: fdata[8], z: fdata[9], w: fdata[10] };
        const scale: IVec3 = { x: fdata[11], y: fdata[12], z: fdata[13] };

        yield {
            geomId,
            materialId,
            dbId,
            flags,
            transform: {
                translation,
                quaternion,
                scale
            }
        };
    }
}
