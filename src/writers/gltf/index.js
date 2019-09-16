/*
 * TODOs:
 * - combine multiple mesh indices/attributes into single bin file
 * - support for materials
 * - support for instance trees, dbIDs, and perhaps properties
 */

const fs = require('fs');
const path = require('path');

class Serializer {
    serialize(model, rootfile) {
        this.buffer = null;
        this.bufferID = -1;
        this.bufferFD = null;

        let manifest = {
            asset: {
                version: '2.0',
                generator: 'svf-to-gltf',
                copyright: '2018 (c) Autodesk'
            },
            buffers: [],
            bufferViews: [],
            accessors: [],
            meshes: [],
            materials: [],
            nodes: [],
            scenes: [],
            scene: 0
        };
    
        const scene = this.serializeScene(model, manifest, rootfile);
        manifest.scenes.push(scene);
        fs.writeFileSync(rootfile + '.gltf', JSON.stringify(manifest, null, 2));

        if (this.bufferFD) {
            fs.closeSync(this.bufferFD);
            this.bufferFD = null;
        }
    
        fs.writeFileSync(rootfile + '.metadata.json', JSON.stringify(model.metadata, null, 4));
    }

    serializeScene(model, manifest, rootfile) {
        let scene = {
            name: 'main-scene',
            nodes: []
        };
    
        for (const fragment of model.fragments) {
            const node = this.serializeFragment(fragment, model, manifest, rootfile);
            const index = manifest.nodes.length;
            manifest.nodes.push(node);
            scene.nodes.push(index);
        }
    
        for (const material of model.materials) {
            const mat = this.serializeMaterial(material, model, manifest, rootfile);
            manifest.materials.push(mat);
        }
    
        return scene;
    }

    serializeFragment(fragment, model, manifest, rootfile) {
        let node = {};
    
        if (fragment.transform) {
            if ('t' in fragment.transform) {
                const t = fragment.transform.t;
                node.translation = [t.x, t.y, t.z];
            }
            if ('s' in fragment.transform) {
                const s = fragment.transform.s;
                node.scale = [s.x, s.y, s.z];
            }
            if ('q' in fragment.transform) {
                const q = fragment.transform.q;
                node.rotation = [q.x, q.y, q.z, q.w];
            }
            if ('matrix' in fragment.transform) {
                const m = fragment.transform.matrix;
                const t = fragment.transform.t;
                node.matrix = [
                    m[0], m[3], m[6], 0,
                    m[1], m[4], m[7], 0,
                    m[2], m[5], m[8], 0,
                    t.x, t.y, t.z, 1
                ]; // 4x4, column major
                delete node.translation; // Translation is already included in the 4x4 matrix
            }
        }
    
        const geometry = model.geometries[fragment.geometryID];
        const fragmesh = model.meshpacks[geometry.packID][geometry.entityID];
        if (fragmesh) {
            const mesh = this.serializeMesh(fragmesh, model, manifest, rootfile);
            node.mesh = manifest.meshes.length;
            manifest.meshes.push(mesh);
            mesh.primitives.forEach(function(primitive) {
                primitive.material = fragment.materialID;
            });
        } else {
            console.warn('Could not find mesh for fragment', fragment, 'geometry', geometry);
        }

        node.name = fragment.dbID.toString();

        return node;
    }
    
    serializeMesh(fragmesh, model, manifest, rootfile) {
        if (this.buffer === null || this.buffer.byteLength > (5 << 20)) {
            if (this.bufferFD !== null) {
                fs.closeSync(this.bufferFD);
                this.bufferFD = null;
            }
            this.bufferID += 1;
            this.buffer = {
                uri: path.basename(rootfile) + '.' + this.bufferID + '.bin',
                byteLength: 0
            };
            manifest.buffers.push(this.buffer);
            this.bufferFD = fs.openSync(rootfile + '.' + this.bufferID + '.bin', 'w');
        }
    
        const indexBufferViewID = manifest.bufferViews.length;
        let indexBufferView = {
            buffer: this.bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        manifest.bufferViews.push(indexBufferView);
        const positionBufferViewID = manifest.bufferViews.length;
        let positionBufferView = {
            buffer: this.bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        manifest.bufferViews.push(positionBufferView);
        const normalBufferViewID = manifest.bufferViews.length;
        let normalBufferView = {
            buffer: this.bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        manifest.bufferViews.push(normalBufferView);
        const uvBufferViewID = manifest.bufferViews.length;
        let uvBufferView = {
            buffer: this.bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        manifest.bufferViews.push(uvBufferView);
    
        const indexAccessorID = manifest.accessors.length;
        let indexAccessor = {
            bufferView: indexBufferViewID,
            componentType: 5123, // UNSIGNED_SHORT
            count: -1,
            type: 'SCALAR'
        };
        manifest.accessors.push(indexAccessor);
        const positionAccessorID = manifest.accessors.length;
        let positionAccessor = {
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3',
            min: [fragmesh.min.x, fragmesh.min.y, fragmesh.min.z],
            max: [fragmesh.max.x, fragmesh.max.y, fragmesh.max.z]
        };
        manifest.accessors.push(positionAccessor);
        const normalAccessorID = manifest.accessors.length;
        let normalAccessor = {
            bufferView: normalBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3'
        };
        manifest.accessors.push(normalAccessor);
        const uvAccessorID = manifest.accessors.length;
        let uvAccessor = {
            bufferView: uvBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC2'
        };
        manifest.accessors.push(uvAccessor);
    
        let mesh = {
            primitives: [{
                attributes: {
                    POSITION: positionAccessorID,
                    NORMAL: normalAccessorID,
                    TEXCOORD_0: uvAccessorID
                },
                indices: indexAccessorID
            }]
        };
    
        // Indices
        const indices = Buffer.from(fragmesh.indices.buffer);
        fs.writeSync(this.bufferFD, indices);
        indexAccessor.count = indices.byteLength / 2;
        indexBufferView.byteOffset = this.buffer.byteLength;
        indexBufferView.byteLength = indices.byteLength;
        this.buffer.byteLength += indices.byteLength;
        if (this.buffer.byteLength % 4 !== 0) {
            // Pad to 4-byte multiples
            const pad = 4 - this.buffer.byteLength % 4;
            fs.writeSync(this.bufferFD, new Uint8Array(pad));
            this.buffer.byteLength += pad;
        }
    
        // Vertices
        const vertices = Buffer.from(fragmesh.vertices.buffer);
        fs.writeSync(this.bufferFD, vertices);
        positionAccessor.count = vertices.byteLength / 4 / 3;
        positionBufferView.byteOffset = this.buffer.byteLength;
        positionBufferView.byteLength = vertices.byteLength;
        this.buffer.byteLength += vertices.byteLength;
    
        // Normals
        if (fragmesh.normals) {
            const normals = Buffer.from(fragmesh.normals.buffer);
            fs.writeSync(this.bufferFD, normals);
            normalAccessor.count = normals.byteLength / 4 / 3;
            normalBufferView.byteOffset = this.buffer.byteLength;
            normalBufferView.byteLength = normals.byteLength;
            this.buffer.byteLength += normals.byteLength;
        }

        // UVs (only the first UV map if there's one)
        if (fragmesh.uvmaps && fragmesh.uvmaps.length > 0) {
            const uvs = Buffer.from(fragmesh.uvmaps[0].uvs.buffer);
            fs.writeSync(this.bufferFD, uvs);
            uvAccessor.count = uvs.byteLength / 4 / 2;
            uvBufferView.byteOffset = this.buffer.byteLength;
            uvBufferView.byteLength = uvs.byteLength;
            this.buffer.byteLength += uvs.byteLength;
        }
    
        return mesh;
    }

    serializeMaterial(mat, model, manifest, rootfile) {
        //console.log(JSON.stringify(mat));
        switch (mat.definition) {
            case 'SimplePhong':
                if (mat.properties.colors && mat.properties.colors.generic_diffuse) {
                    const color = mat.properties.colors.generic_diffuse.values[0];
                    return {
                        pbrMetallicRoughness: {
                            baseColorFactor: [color.r, color.g, color.b, color.a],
                            //baseColorTexture: {},
                            //metallicRoughnessTexture: {},
                            metallicFactor: 0,
                            roughnessFactor: 1
                        }
                    };
                } else {
                    console.warn('Could not obtain diffuse color', mat);
                    return {};
                }
            default:
                console.warn('Unknown material definition', mat.definition);
                return {};
        }
    }
}

function serialize(model, rootfile) {
    const serializer = new Serializer();
    serializer.serialize(model, rootfile);
}

module.exports = {
    serialize
};