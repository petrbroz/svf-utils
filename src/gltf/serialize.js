/*
 * TODOs:
 * - combine multiple mesh indices/attributes into single bin file
 * - support for materials
 * - support for instance trees, dbIDs, and perhaps properties
 */

const fs = require('fs');
const path = require('path');

let buffer = null;
let bufferID = -1;
let bufferFD = null;

function serialize(model, rootfile) {
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

    const scene = serializeScene(model, manifest, rootfile);
    manifest.scenes.push(scene);
    fs.writeFileSync(rootfile + '.gltf', JSON.stringify(manifest, null, 2));

    if (bufferFD !== null) {
        fs.closeSync(bufferFD);
    }
}

function serializeScene(model, manifest, rootfile) {
    let scene = {
        name: 'main-scene',
        nodes: []
    };

    for (const fragment of model.fragments) {
        const node = serializeFragment(fragment, model, manifest, rootfile);
        const index = manifest.nodes.length;
        manifest.nodes.push(node);
        scene.nodes.push(index);
    }

    for (const material of model.materials) {
        const mat = serializeMaterial(material, model, manifest, rootfile);
        manifest.materials.push(mat);
    }

    return scene;
}

function serializeFragment(fragment, model, manifest, rootfile) {
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
            console.error('matrix not supported yet!');
        }
    }

    const geometry = model.geometries[fragment.geometryID];
    const fragmesh = model.meshpacks[geometry.packID][geometry.entityID];
    if (fragmesh) {
        const mesh = serializeMesh(fragmesh, model, manifest, rootfile);
        node.mesh = manifest.meshes.length;
        manifest.meshes.push(mesh);
        mesh.primitives.forEach(function(primitive) {
            primitive.material = fragment.materialID;
        });
    } else {
        console.warn('Could not find mesh for fragment', fragment, 'geometry', geometry);
    }

    return node;
}

function serializeMesh(fragmesh, model, manifest, rootfile) {
    if (buffer === null || buffer.byteLength > (5 << 20)) {
        if (bufferFD !== null) {
            fs.closeSync(bufferFD);
        }
        bufferID += 1;
        buffer = {
            uri: path.basename(rootfile) + '.' + bufferID + '.bin',
            byteLength: 0
        };
        manifest.buffers.push(buffer);
        bufferFD = fs.openSync(rootfile + '.' + bufferID + '.bin', 'w');
    }

    const indexBufferViewID = manifest.bufferViews.length;
    let indexBufferView = {
        buffer: bufferID,
        byteOffset: -1,
        byteLength: -1
    };
    manifest.bufferViews.push(indexBufferView);
    const positionBufferViewID = manifest.bufferViews.length;
    let positionBufferView = {
        buffer: bufferID,
        byteOffset: -1,
        byteLength: -1
    };
    manifest.bufferViews.push(positionBufferView);
    const normalBufferViewID = manifest.bufferViews.length;
    let normalBufferView = {
        buffer: bufferID,
        byteOffset: -1,
        byteLength: -1
    };
    manifest.bufferViews.push(normalBufferView);

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

    let mesh = {
        primitives: [{
            attributes: {
                POSITION: positionAccessorID,
                NORMAL: normalAccessorID
            },
            indices: indexAccessorID
        }]
    };

    // Indices
    const indices = Buffer.from(fragmesh.indices.buffer);
    fs.writeSync(bufferFD, indices);
    indexAccessor.count = indices.byteLength / 2;
    indexBufferView.byteOffset = buffer.byteLength;
    indexBufferView.byteLength = indices.byteLength;
    buffer.byteLength += indices.byteLength;
    if (buffer.byteLength % 4 !== 0) {
        // Pad to 4-byte multiples
        const pad = 4 - buffer.byteLength % 4;
        fs.writeSync(bufferFD, new Uint8Array(pad));
        buffer.byteLength += pad;
    }

    // Vertices
    const vertices = Buffer.from(fragmesh.vertices.buffer);
    fs.writeSync(bufferFD, vertices);
    positionAccessor.count = vertices.byteLength / 4 / 3;
    positionBufferView.byteOffset = buffer.byteLength;
    positionBufferView.byteLength = vertices.byteLength;
    buffer.byteLength += vertices.byteLength;

    // Normals
    if (fragmesh.normals) {
        const normals = Buffer.from(fragmesh.normals.buffer);
        fs.writeSync(bufferFD, normals);
        normalAccessor.count = normals.byteLength / 4 / 3;
        normalBufferView.byteOffset = buffer.byteLength;
        normalBufferView.byteLength = normals.byteLength;
        buffer.byteLength += normals.byteLength;
    }

    return mesh;
}

function serializeMaterial(mat, model, manifest, rootfile) {
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

module.exports = {
    serialize
};