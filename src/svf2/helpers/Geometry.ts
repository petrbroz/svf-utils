import { InputStream } from '../../common/input-stream';

export type Geometry = IMeshGeometry | ILineGeometry;

export interface IMeshGeometry {
    type: GeometryType.Triangles;
    indices: Uint16Array;
    vertices: Float32Array;
    normals?: Float32Array;
    colors?: Float32Array;
    uvs?: Float32Array
}

export interface ILineGeometry {
    type: GeometryType.Lines;
    indices: Uint16Array;
    vertices: Float32Array;
}

export enum GeometryType {
    Triangles = 0,
    Lines = 1,
    Points = 2,
    WideLines = 3,
}

interface IGeometryAttribute {
    attributeType: AttributeType;
    componentType: ComponentType; // Type of individual components of each item for this attribute (for example, FLOAT for vec3 vertices)
    itemSize: number; // Number of components in each item for this attribute (for example, 3 for vec3 vertices)
    itemOffset: number;
    itemStride: number;
    bufferId: number;
}

enum AttributeType {
    Index = 0,
    IndexEdges = 1,
    Position = 2,
    Normal = 3,
    TextureUV = 4,
    Color = 5,
}

enum ComponentType {
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
    UINT = 10,
    //DOUBLE = 11
}

function attributeTypeSize(componentType: ComponentType): number {
    switch (componentType) {
        case ComponentType.BYTE:
        case ComponentType.UBYTE:
        case ComponentType.BYTE_NORM:
        case ComponentType.UBYTE_NORM:
            return 1;
        case ComponentType.SHORT:
        case ComponentType.USHORT:
        case ComponentType.SHORT_NORM:
        case ComponentType.USHORT_NORM:
            return 2;
        case ComponentType.FLOAT:
        case ComponentType.INT:
        case ComponentType.UINT:
            return 4;
        default:
            throw new Error(`Unknown component type: ${componentType}`);
    }
}

/**
 * Parses the geometry data from the given buffer.
 *
 * @param buffer The buffer containing the geometry data.
 * @returns An object representing the parsed geometry.
 * @throws Will throw an error if the magic string is not 'OTG0'.
 */
export function parseGeometry(buffer: Buffer): Geometry {
    const stream = new InputStream(buffer);
    const magic = stream.getString(4);
    console.assert(magic === 'OTG0');
    const flags = stream.getUint16();
    const geomType: GeometryType = flags & 0x03;
    const buffCount = stream.getUint8();
    const attrCount = stream.getUint8();
    const buffOffsets = [0];
    for (let i = 1; i < buffCount; i++) {
        buffOffsets.push(stream.getUint32());
    }
    const attributes: IGeometryAttribute[] = [];
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

    switch (geomType) {
        case GeometryType.Triangles:
            return parseTriangleGeometry(attributes, buffers);
        case GeometryType.Lines:
            return parseLineGeometry(attributes, buffers);
        default:
            throw new Error(`Unsupported geometry type: ${geomType}`);
    }
}

function parseGeometryAttribute(stream: InputStream): IGeometryAttribute {
    const attributeType: AttributeType = stream.getUint8();
    const b = stream.getUint8();
    const itemSize: number = b & 0x0f;
    const componentType: ComponentType = (b >> 4) & 0x0f;
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

function parseTriangleGeometry(attributes: IGeometryAttribute[], buffers: Buffer[]): IMeshGeometry {
    return {
        type: GeometryType.Triangles,
        indices: getIndices(attributes, buffers, false),
        vertices: getVertices(attributes, buffers),
        normals: getNormals(attributes, buffers),
        colors: getColors(attributes, buffers),
        uvs: getUvs(attributes, buffers)
    };
}

function parseLineGeometry(attributes: IGeometryAttribute[], buffers: Buffer[]): ILineGeometry {
    return {
        type: GeometryType.Lines,
        indices: getIndices(attributes, buffers, true),
        vertices: getVertices(attributes, buffers),
    };
}

function deltaDecodeIndexBuffer3(ib: any) {
    if (!ib.length)
        return;
    ib[1] += ib[0];
    ib[2] += ib[0];
    for (var i = 3; i < ib.length; i += 3) {
        ib[i] += ib[i - 3];
        ib[i + 1] += ib[i];
        ib[i + 2] += ib[i];
    }
}

function deltaDecodeIndexBuffer2(ib: any) {
    if (!ib.length)
        return;
    ib[1] += ib[0];
    for (var i = 2; i < ib.length; i += 2) {
        ib[i] += ib[i - 2];
        ib[i + 1] += ib[i];
    }
}

function decodeNormal(enc: { x: number; y: number; }): ({ x: number; y: number; z: number; }) {
    let ang = { x: enc.x * 2.0 - 1.0, y: enc.y * 2.0 - 1.0 };
    let scth = { x: Math.sin(ang.x * Math.PI), y: Math.cos(ang.x * Math.PI) };
    let scphi = { x: Math.sqrt(1.0 - ang.y * ang.y), y: ang.y };
    return { x: scth.y * scphi.x, y: scth.x * scphi.x, z: scphi.y };
}

function getIndices(attributes: IGeometryAttribute[], buffers: Buffer[], isLines: boolean): Uint16Array {
    const indicesAttr: IGeometryAttribute = attributes.filter((a: IGeometryAttribute) => a.attributeType === AttributeType.Index)[0];
    if (indicesAttr) {
        const buffer = buffers[indicesAttr.bufferId];
        const is = new InputStream(buffer);
        const ind: number[] = [];
        is.seek(indicesAttr.itemOffset);
        while (is.offset < is.length) {
            ind.push(is.getUint16());
        }
        if (isLines) {
            deltaDecodeIndexBuffer2(ind);
        } else {
            deltaDecodeIndexBuffer3(ind);
        }
        return new Uint16Array(ind);
    }
    return new Uint16Array();
}

function getVertices(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array {
    const verticesAttr: IGeometryAttribute = attributes.filter((a: IGeometryAttribute) => a.attributeType === AttributeType.Position)[0];
    if (verticesAttr) {
        const buffer = buffers[verticesAttr.bufferId];
        const is = new InputStream(buffer);
        const vert: number[] = [];
        is.seek(verticesAttr.itemOffset);
        while (is.offset < is.length) {
            const originalOffset = is.offset;
            for (let i = 0; i < verticesAttr.itemSize; i++) {
                vert.push(is.getFloat32());
            }
            is.seek(originalOffset + verticesAttr.itemStride);
        }
        return new Float32Array(vert);
    }
    return new Float32Array();
}

function getColors(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined {
    const colorsAttr: IGeometryAttribute = attributes.filter((a: IGeometryAttribute) => a.attributeType === AttributeType.Color)[0];
    if (colorsAttr) {
        const buffer = buffers[colorsAttr.bufferId];
        const is = new InputStream(buffer);
        const colors: number[] = [];
        is.seek(colorsAttr.itemOffset);
        while (is.offset < is.length) {
            const originalOffset = is.offset;
            for (let i = 0; i < colorsAttr.itemSize; i++) {
                colors.push(is.getFloat32());
            }

            is.seek(originalOffset + colorsAttr.itemStride);
        }

        return new Float32Array(colors);

    }
    return undefined;
}

function getNormals(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined {
    const normalsAttr: IGeometryAttribute = attributes.filter((a: IGeometryAttribute) => a.attributeType === AttributeType.Normal)[0];
    if (normalsAttr) {
        const buffer = buffers[normalsAttr.bufferId];
        // const componentType = normalsAttr.componentType;
        const is = new InputStream(buffer);
        const normals: number[] = [];
        is.seek(normalsAttr.itemOffset);
        while (is.offset < is.length) {
            const originalOffset = is.offset;
            const encodedNorm = [];
            for (let i = 0; i < normalsAttr.itemSize; i++) {
                encodedNorm.push((is.getUint16() / 65535))
            }
            const decodedNorm = decodeNormal({ x: encodedNorm[0], y: encodedNorm[1] });
            normals.push(decodedNorm.x, decodedNorm.y, decodedNorm.z);
            is.seek(originalOffset + normalsAttr.itemStride);
        }
        return new Float32Array(normals);
    }
    return undefined;
}

// TODO: handle uvmaps with multiple channels as done in svf ?
function getUvs(attributes: IGeometryAttribute[], buffers: Buffer[]): Float32Array | undefined {
    const uvsAttr: IGeometryAttribute = attributes.filter((a: IGeometryAttribute) => a.attributeType === AttributeType.TextureUV)[0];
    if (uvsAttr) {
        const buffer = buffers[uvsAttr.bufferId];
        const is = new InputStream(buffer);
        const uvs: number[] = [];
        is.seek(uvsAttr.itemOffset);
        while (is.offset < is.length) {
            const originalOffset = is.offset;
            if (uvsAttr.itemSize === 2) {
                uvs.push(is.getFloat32());
                uvs.push(1.0 - is.getFloat32());
            } else {
                console.log(`Can't parse uvs with this itemSize`);
            }
            is.seek(originalOffset + uvsAttr.itemStride);
        }
        return new Float32Array(uvs);
    }
    return undefined;
}