import { PackFileReader } from '../common/packfile-reader';
import { IMesh, ILines, IPoints, IUVMap } from './schema';

/**
 * Parses meshes from a binary buffer, typically stored in files called '<number>.pf',
 * referenced in the SVF manifest as an asset of type 'Autodesk.CloudPlatform.PackFile'.
 * @generator
 * @param {Buffer} buffer Binary buffer to parse.
 * @returns {Iterable<IMesh | ILines | IPoints | null>} Instances of parsed meshes, or null values
 * if the mesh cannot be parsed (and to maintain the indices used in {@link IGeometry}).
 */
export function *parseMeshes(buffer: Buffer): Iterable<IMesh | ILines | IPoints | null> {
    const pfr = new PackFileReader(buffer);
    for (let i = 0, len = pfr.numEntries(); i < len; i++) {
        const entry = pfr.seekEntry(i);
        console.assert(entry);
        console.assert(entry.version >= 1);

        switch (entry._type) {
            case 'Autodesk.CloudPlatform.OpenCTM':
                yield parseMeshOCTM(pfr);
                break;
            case 'Autodesk.CloudPlatform.Lines':
                yield parseLines(pfr, entry.version);
                break;
            case 'Autodesk.CloudPlatform.Points':
                yield parsePoints(pfr, entry.version);
                break;
        }
    }
}

function parseMeshOCTM(pfr: PackFileReader): IMesh | null {
    const fourcc = pfr.getString(4);
    console.assert(fourcc === 'OCTM');
    const version = pfr.getInt32();
    console.assert(version === 5);
    const method = pfr.getString(3);
    pfr.getUint8(); // Read the last 0 char of the RAW or MG2 fourCC

    switch (method) {
        case 'RAW':
            return parseMeshRAW(pfr);
        default:
            console.warn('Unsupported OpenCTM method', method);
            return null;
    }
}

function parseMeshRAW(pfr: PackFileReader): IMesh {
    // We will create a single ArrayBuffer to back both the vertex and index buffers.
    // The indices will be places after the vertex information, because we need alignment of 4 bytes.

    const vcount = pfr.getInt32(); // Num of vertices
    const tcount = pfr.getInt32(); // Num of triangles
    const uvcount = pfr.getInt32(); // Num of UV maps
    const attrs = pfr.getInt32(); // Number of custom attributes per vertex
    const flags = pfr.getInt32(); // Additional flags (e.g., whether normals are present)
    const comment = pfr.getString(pfr.getInt32());

    // Indices
    let name = pfr.getString(4);
    console.assert(name === 'INDX');
    const indices = new Uint16Array(tcount * 3);
    for (let i = 0; i < tcount * 3; i++) {
        indices[i] = pfr.getUint32();
    }

    // Vertices
    name = pfr.getString(4);
    console.assert(name === 'VERT');
    const vertices = new Float32Array(vcount * 3);
    const min = { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE };
    const max = { x: Number.MIN_VALUE, y: Number.MIN_VALUE, z: Number.MIN_VALUE };
    for (let i = 0; i < vcount * 3; i += 3) {
        const x = vertices[i] = pfr.getFloat32();
        const y = vertices[i + 1] = pfr.getFloat32();
        const z = vertices[i + 2] = pfr.getFloat32();
        min.x = Math.min(min.x, x);
        max.x = Math.max(max.x, x);
        min.y = Math.min(min.y, y);
        max.y = Math.max(max.y, y);
        min.z = Math.min(min.z, z);
        max.z = Math.max(max.z, z);
    }

    // Normals
    let normals: Float32Array | null = null;
    if (flags & 1) {
        name = pfr.getString(4);
        console.assert(name === 'NORM');
        normals = new Float32Array(vcount * 3);
        for (let i = 0; i < vcount; i++) {
            let x = pfr.getFloat32();
            let y = pfr.getFloat32();
            let z = pfr.getFloat32();
            // Make sure the normals have unit length
            const dot = x * x + y * y + z * z;
            if (dot !== 1.0) {
                const len = Math.sqrt(dot);
                x /= len;
                y /= len;
                z /= len;
            }
            normals[i * 3] = x;
            normals[i * 3 + 1] = y;
            normals[i * 3 + 2] = z;
        }
    }

    // Parse zero or more UV maps
    const uvmaps: IUVMap[] = [];
    for (let i = 0; i < uvcount; i++) {
        name = pfr.getString(4);
        console.assert(name === 'TEXC');
        const uvmap: IUVMap = {
            name: '',
            file: '',
            uvs: new Float32Array()
        };
        uvmap.name = pfr.getString(pfr.getInt32());
        uvmap.file = pfr.getString(pfr.getInt32());
        uvmap.uvs = new Float32Array(vcount * 2);
        for (let j = 0; j < vcount; j++) {
            uvmap.uvs[j * 2] = pfr.getFloat32();
            uvmap.uvs[j * 2 + 1] = 1.0 - pfr.getFloat32();
        }
        uvmaps.push(uvmap);
    }

    // Parse custom attributes (currently we only support "Color" attrs)
    let colors: Float32Array | null = null;
    if (attrs > 0) {
        name = pfr.getString(4);
        console.assert(name === 'ATTR');
        for (let i = 0; i < attrs; i++) {
            const attrName = pfr.getString(pfr.getInt32());
            if (attrName === 'Color') {
                colors = new Float32Array(vcount * 4);
                for (let j = 0; j < vcount; j++) {
                    colors[j * 4] = pfr.getFloat32();
                    colors[j * 4 + 1] = pfr.getFloat32();
                    colors[j * 4 + 2] = pfr.getFloat32();
                    colors[j * 4 + 3] = pfr.getFloat32();
                }
            } else {
                pfr.seek(pfr.offset + vcount * 4);
            }
        }
    }

    const mesh: IMesh = { vcount, tcount, uvcount, attrs, flags, comment, uvmaps, indices, vertices, min, max };
    if (normals) {
        mesh.normals = normals;
    }
    if (colors) {
        mesh.colors = colors;
    }
    return mesh;
}

function parseLines(pfr: PackFileReader, entryVersion: number): ILines {
    console.assert(entryVersion >= 2);

    const vertexCount = pfr.getUint16();
    const indexCount = pfr.getUint16();
    const boundsCount = pfr.getUint16(); // Ignoring for now
    const lineWidth = (entryVersion > 2) ? pfr.getFloat32() : 1.0;
    const hasColors = pfr.getUint8() !== 0;
    const lines: ILines = {
        isLines: true,
        vcount: vertexCount,
        lcount: indexCount / 2,
        vertices: new Float32Array(vertexCount * 3),
        indices: new Uint16Array(indexCount),
        lineWidth
    };

    // Parse vertices
    for (let i = 0, len = vertexCount * 3; i < len; i++) {
        lines.vertices[i] = pfr.getFloat32();
    }

    // Parse colors
    if (hasColors) {
        lines.colors = new Float32Array(vertexCount * 3);
        for (let i = 0, len = vertexCount * 3; i < len; i++) {
            lines.colors[i] = pfr.getFloat32();
        }
    }

    // Parse indices
    for (let i = 0, len = indexCount; i < len; i++) {
        lines.indices[i] = pfr.getUint16();
    }

    // TODO: Parse polyline bounds

    return lines;
}

function parsePoints(pfr: PackFileReader, entryVersion: number): IPoints {
    console.assert(entryVersion >= 2);

    const vertexCount = pfr.getUint16();
    const indexCount = pfr.getUint16();
    const pointSize = pfr.getFloat32();
    const hasColors = pfr.getUint8() !== 0;
    const points: IPoints = {
        isPoints: true,
        vcount: vertexCount,
        vertices: new Float32Array(vertexCount * 3),
        pointSize
    };

    // Parse vertices
    for (let i = 0, len = vertexCount * 3; i < len; i++) {
        points.vertices[i] = pfr.getFloat32();
    }

    // Parse colors
    if (hasColors) {
        points.colors = new Float32Array(vertexCount * 3);
        for (let i = 0, len = vertexCount * 3; i < len; i++) {
            points.colors[i] = pfr.getFloat32();
        }
    }

    return points;
}
