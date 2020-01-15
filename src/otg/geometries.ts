import { InputStream } from '../common/input-stream';
import * as OTG from './schema';

export function parseGeometry(buffer: Buffer): OTG.IGeometry {
    const stream = new InputStream(buffer);
    const magic = stream.getString(4);
    console.assert(magic === 'OTG0');
    const flags = stream.getUint16();
    const geomType: OTG.GeometryType = flags & 0x03;
    const buffCount = stream.getUint8();
    const attrCount = stream.getUint8();
    let buffOffsets = [0];
    for (let i = 1; i < buffCount; i++) {
        buffOffsets.push(stream.getUint32());
    }
    let attributes: OTG.IGeometryAttribute[] = [];
    for (let i = 0; i < attrCount; i++) {
        attributes.push(parseGeometryAttribute(stream));
    }
    let dataOffset = stream.offset;
    if (dataOffset % 4 !== 0) {
        dataOffset += 4 - (dataOffset % 4);
    }
    let buffers: Buffer[] = [];
    for (let i = 0; i < buffCount; i++) {
        const offset = dataOffset + buffOffsets[i];
        const length = (i + 1 < buffCount) ? buffOffsets[i + 1] - buffOffsets[i] : buffer.length - offset;
        const buff = Buffer.alloc(length);
        buffer.copy(buff, 0, offset, offset + length);
        buffers.push(buff);
    }

    return {
        type: geomType,
        attributes,
        buffers
    };
}

function parseGeometryAttribute(stream: InputStream): OTG.IGeometryAttribute {
    const attributeType: OTG.AttributeType = stream.getUint8();
    const b = stream.getUint8();
    const itemSize: number = b & 0x0f;
    const componentType: OTG.ComponentType = (b >> 4) & 0x0f;
    const itemOffset: number = stream.getUint8(); // offset in bytes
    const itemStride: number = stream.getUint8(); // stride in bytes
    const bufferId: number = stream.getUint8();
    return {
        attributeType,
        componentType,
        itemSize,
        itemOffset,
        itemStride,
        bufferId
    };
}
