import { InputStream } from '../common/input-stream';

interface IGeometry {
    flags: number;
    attributes: IGeometryAttribute[];
    buffers: Buffer[];
}

interface IGeometryAttribute {
    name: AttributeName;
    type: AttributeType;
    itemSize: number;
    itemOffset: number;
    itemStride: number;
    bufferId: number;
}

enum AttributeName {
	Index = 0,
	IndexEdges = 1,
	Position = 2,
	Normal = 3,
	TextureUV = 4,
	Color = 5
}

enum AttributeType {
	BYTE = 0,
	SHORT = 1,
	UBYTE = 2,
	USHORT = 3,

	BYTE_NORM = 4,
	SHORT_NORM = 5,
	UBYTE_NORM = 6,
	USHORT_NORM = 7,

	FLOAT = 8,
	INT = 9,
	UINT = 10
	//DOUBLE = 11
}

export function parseGeometry(buffer: Buffer): IGeometry {
    const stream = new InputStream(buffer);
    const magic = stream.getString(4);
    console.assert(magic === 'OTG0');
    const flags = stream.getUint16();
    const buffCount = stream.getUint8();
    const attrCount = stream.getUint8();
    let buffOffsets = [0];
    for (let i = 1; i < buffCount; i++) {
        buffOffsets.push(stream.getUint32());
    }
    let attributes: IGeometryAttribute[] = [];
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
        flags,
        attributes,
        buffers
    };
}

function parseGeometryAttribute(stream: InputStream): IGeometryAttribute {
    const attrName: AttributeName = stream.getUint8();
    const b = stream.getUint8();
    const itemSize: number = b & 0x0f;
    const itemType: AttributeType = (b >> 4) & 0x0f;
    const itemOffset: number = stream.getUint8(); // offset in bytes
    const itemStride: number = stream.getUint8(); // stride in bytes
    const bufferId: number = stream.getUint8();
    return {
        name: attrName,
        type: itemType,
        itemSize,
        itemOffset,
        itemStride,
        bufferId
    };
}
