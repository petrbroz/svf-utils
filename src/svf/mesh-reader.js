const { PackFileReader } = require('./pack-file-reader');

class MeshReader extends PackFileReader {
    constructor(buff) {
        super(buff);
        this.parseMeshes();
    }

    parseMeshes() {
        const entries = this.numEntries();
        this.meshes = [];
        for (let i = 0; i < entries; i++) {
            const entry = this.seekEntry(i);
            console.assert(entry);
            console.assert(entry.version >= 1);

            switch (entry._type) {
                case 'Autodesk.CloudPlatform.OpenCTM':
                    this.meshes.push(this.parseMeshOCTM());
                    break;
                case 'Autodesk.CloudPlatform.Lines': // TODO
                    break;
                case 'Autodesk.CloudPlatform.Points': // TODO
                    break;
            }
        }
    }

    parseMeshOCTM() {
        const stream = this.stream;

        const fourcc = stream.getString(4);
        console.assert(fourcc === 'OCTM');
        const version = stream.getInt32();
        console.assert(version === 5);
        const method = stream.getString(3);
        stream.getUint8(); // Read the last 0 char of the RAW or MG2 fourCC

        let mesh = {
            fourcc,
            version,
            method
        };
        mesh.vcount = stream.getInt32(); // Num of vertices
        mesh.tcount = stream.getInt32(); // Num of triangles
        mesh.uvs = stream.getInt32(); // Num of texture UVs per vertex
        mesh.attrs = stream.getInt32(); // Number of attributes per vertex
        mesh.flags = stream.getInt32();
        mesh.comment = stream.getString(stream.getInt32());
        switch (method) {
            case 'RAW':
                this.parseMeshRAW(mesh);
                return mesh;
            case 'MG2':
                this.parseMeshMG2(mesh);
                return mesh;
            default:
                console.error('Unexpected OpenCTM method.');
                return null;
        }
    }

    parseMeshRAW(mesh) {
        // We will create a single ArrayBuffer to back both the vertex and index buffers.
        // The indices will be places after the vertex information, because we need alignment of 4 bytes.
        const stream = this.stream;

        // Indices
        let name = stream.getString(4);
        console.assert(name === 'INDX');
        mesh.indices = new Uint16Array(mesh.tcount * 3);
        for (let i = 0; i < mesh.tcount * 3; i++) {
            mesh.indices[i] = stream.getUint32();
        }

        // Vertices
        name = stream.getString(4);
        console.assert(name === 'VERT');
        mesh.vertices = new Float32Array(mesh.vcount * 3);
        mesh.min = { x: Number.MAX_VALUE, y: Number.MAX_VALUE, z: Number.MAX_VALUE };
        mesh.max = { x: Number.MIN_VALUE, y: Number.MIN_VALUE, z: Number.MIN_VALUE };
        for (let i = 0; i < mesh.vcount * 3; i += 3) {
            const x = mesh.vertices[i] = stream.getFloat32();
            const y = mesh.vertices[i + 1] = stream.getFloat32();
            const z = mesh.vertices[i + 2] = stream.getFloat32();
            mesh.min.x = Math.min(mesh.min.x, x);
            mesh.max.x = Math.max(mesh.max.x, x);
            mesh.min.y = Math.min(mesh.min.y, y);
            mesh.max.y = Math.max(mesh.max.y, y);
            mesh.min.z = Math.min(mesh.min.z, z);
            mesh.max.z = Math.max(mesh.max.z, z);
        }

        // Normals
        if (mesh.flags & 1) {
            name = stream.getString(4);
            console.assert(name === 'NORM');
            mesh.normals = new Float32Array(mesh.vcount * 3);
            for (let i = 0; i < mesh.vcount * 3; i++) {
                mesh.normals[i] = stream.getFloat32();
            }
        }
    }

    parseMeshMG2(mesh) {
        throw new Error('Not implemented');
    }
}

module.exports = {
    MeshReader
};