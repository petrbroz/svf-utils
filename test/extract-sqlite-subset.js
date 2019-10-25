const sqlite3 = require('sqlite3');
const fse = require('fs-extra');

function setupDatabase(sqlitePath) {
    const db = new sqlite3.Database(sqlitePath);
    return new Promise(function (resolve, reject) {
        db.serialize(function () { resolve(db); });
    });
}

function closeDatabase(db) {
    return new Promise(function (resolve, reject) {
        db.close(function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

function buildNodes(db, gltf, filter) {
    console.log('Building nodes...');
    const meshSet = new Set(); // Set of all mesh IDs to be returned by this function's promise
    const scene = gltf.scenes[0];
    const query = `
        SELECT id, dbid, mesh_id, matrix_json AS mtx, translation_x AS tx, translation_y AS ty, translation_z AS tz, scale_x AS sx, scale_y AS sy, scale_z AS sz, rotation_x AS rx, rotation_y AS ry, rotation_z AS rz, rotation_w AS rw
        FROM nodes
        ${filter}
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let node = {
                __id: row.id,
                name: row.dbid.toString(),
                mesh: row.mesh_id
            };
            if (row.mtx) {
                node.matrix = JSON.parse(row.mtx);
            } else {
                if (row.tx || row.ty || row.tz) {
                    node.translation = [row.tx, row.ty, row.tz];
                }
                if (row.sx || row.sy || row.sz) {
                    node.scale = [row.sx, row.sy, row.sz];
                }
                if (row.rx || row.ry || row.rz || row.rw) {
                    node.rotation = [row.rx, row.ry, row.rz, row.rw];
                }
            }
            const id = gltf.nodes.push(node) - 1;
            scene.nodes.push(id);
            meshSet.add(node.mesh);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, meshSet });
            }
        });
    });
}

function buildMeshes(db, gltf, meshSet) {
    console.log('Building meshes...');
    const materialSet = new Set(); // Set of all material IDs to be returned by this function's promise
    const accessorSet = new Set(); // Set of all accessor IDs to be returned by this function's promise
    const query = `
        SELECT id, mode, material_id, index_accessor_id, position_accessor_id, normal_accessor_id, uv_accessor_id, color_accessor_id
        FROM meshes
        WHERE id IN (${Array.from(meshSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let mesh = {
                __id: row.id,
                primitives: [{
                    attributes: {},
                    material: row.material_id
                }]
            };
            let prim = mesh.primitives[0];
            if (typeof row.mode === 'number') {
                prim.mode = row.mode;
            }
            if (typeof row.index_accessor_id === 'number') {
                prim.indices = row.index_accessor_id;
                accessorSet.add(prim.indices);
            }
            if (typeof row.index_accessor_id === 'number') {
                prim.indices = row.index_accessor_id;
                accessorSet.add(row.index_accessor_id);
            }
            if (typeof row.position_accessor_id === 'number') {
                prim.attributes['POSITION'] = row.position_accessor_id;
                accessorSet.add(row.position_accessor_id);
            }
            if (typeof row.normal_accessor_id === 'number') {
                prim.attributes['NORMAL'] = row.normal_accessor_id;
                accessorSet.add(row.normal_accessor_id);
            }
            if (typeof row.uv_accessor_id === 'number') {
                prim.attributes['TEXCOORD_0'] = row.uv_accessor_id;
                accessorSet.add(row.uv_accessor_id);
            }
            if (typeof row.color_accessor_id === 'number') {
                prim.attributes['COLOR_0'] = row.color_accessor_id;
                accessorSet.add(row.color_accessor_id);
            }
            gltf.meshes.push(mesh);
            materialSet.add(prim.material);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, materialSet, accessorSet });
            }
        });
    });
}

function buildAccessors(db, gltf, accessorSet) {
    console.log('Building accessors...');
    const bufferViewSet = new Set(); // Set of all buffer view IDs to be returned by this function's promise
    const query = `
        SELECT id, type, component_type, count, buffer_view_id, min_x, min_y, min_z, max_x, max_y, max_z
        FROM accessors
        WHERE id IN (${Array.from(accessorSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let accessor = {
                __id: row.id,
                type: row.type,
                componentType: row.component_type,
                count: row.count,
                bufferView: row.buffer_view_id
            };
            if (typeof row.min_x === 'number') {
                accessor.min = [row.min_x, row.min_y, row.min_z];
            }
            if (typeof row.max_x === 'number') {
                accessor.max = [row.max_x, row.max_y, row.max_z];
            }
            gltf.accessors.push(accessor);
            bufferViewSet.add(accessor.bufferView);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, bufferViewSet });
            }
        });
    });
}

function buildBufferViews(db, gltf, bufferViewSet) {
    console.log('Building buffer views...');
    const bufferSet = new Set(); // Set of all buffer IDs to be returned by this function's promise
    const query = `
        SELECT id, buffer_id, byte_offset, byte_length
        FROM buffer_views
        WHERE id IN (${Array.from(bufferViewSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let bufferView = {
                __id: row.id,
                buffer: row.buffer_id,
                byteOffset: row.byte_offset,
                byteLength: row.byte_length
            };
            gltf.bufferViews.push(bufferView);
            bufferSet.add(bufferView.buffer);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, bufferSet });
            }
        });
    });
}

function buildBuffers(db, gltf, bufferSet) {
    console.log('Building buffers...');
    const query = `
        SELECT id, uri, byte_length
        FROM buffers
        WHERE id IN (${Array.from(bufferSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let buffer = {
                __id: row.id,
                uri: row.uri,
                byteLength: row.byte_length
            };
            gltf.buffers.push(buffer);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count });
            }
        });
    });
}

function buildMaterials(db, gltf, materialSet) {
    console.log('Building materials...');
    const textureSet = new Set(); // Set of all texture IDs to be returned by this function's promise
    const query = `
        SELECT id, base_color_factor_r, base_color_factor_g, base_color_factor_b, metallic_factor, roughness_factor, base_color_texture_id, base_color_texture_uv
        FROM materials
        WHERE id IN (${Array.from(materialSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let material = {
                __id: row.id,
                pbrMetallicRoughness: {}
            };
            if (typeof row.base_color_factor_r === 'number') {
                material.pbrMetallicRoughness.baseColorFactor = [
                    row.base_color_factor_r,
                    row.base_color_factor_g,
                    row.base_color_factor_b,
                    1.0 // TODO: bring back support for transparent materials
                ];
            }
            if (typeof row.metallic_factor === 'number') {
                material.pbrMetallicRoughness.metallicFactor = row.metallic_factor;
            }
            if (typeof row.roughness_factor === 'number') {
                material.pbrMetallicRoughness.roughnessFactor = row.roughness_factor;
            }
            if (typeof row.base_color_texture_id === 'number') {
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: row.base_color_texture_id
                };
                if (typeof row.base_color_texture_uv === 'number') {
                    material.pbrMetallicRoughness.baseColorTexture.texCoord = row.base_color_texture_uv;
                }
                textureSet.add(row.base_color_texture_id);
            }
            gltf.materials.push(material);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, textureSet });
            }
        });
    });
}

function buildTextures(db, gltf, textureSet) {
    console.log('Building textures...');
    const imageSet = new Set(); // Set of all image IDs to be returned by this function's promise
    const query = `
        SELECT id, source_id
        FROM textures
        WHERE id IN (${Array.from(textureSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let texture = {
                __id: row.id,
                source: row.source_id
            };
            gltf.textures.push(texture);
            imageSet.add(texture.source);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, imageSet });
            }
        });
    });
}

function buildImages(db, gltf, imageSet) {
    console.log('Building images...');
    const query = `
        SELECT id, uri
        FROM images
        WHERE id IN (${Array.from(imageSet.values()).join(',')})
    `;
    const onRow = (err, row) => {
        if (err) {
            console.error(err);
        } else {
            let image = {
                __id: row.id,
                uri: row.uri
            };
            gltf.images.push(image);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err, count) {
            if (err) {
                reject(err);
            } else {
                resolve({ count });
            }
        });
    });
}

function rebuildIndices(gltf) {
    console.log('Rebuilding indices...');

    // Rebuild node-to-mesh IDs
    for (const node of gltf.nodes) {
        node.mesh = gltf.meshes.findIndex(mesh => mesh.__id === node.mesh);
        delete node.__id;
    }

    // Rebuild mesh-to-accessor and mesh-to-material IDs
    for (const mesh of gltf.meshes) {
        const prim = mesh.primitives[0];
        if (typeof prim.material === 'number') {
            prim.material = gltf.materials.findIndex(material => material.__id === prim.material);
        }
        if (typeof prim.indices === 'number') {
            prim.indices = gltf.accessors.findIndex(accessor => accessor.__id === prim.indices);
        }
        for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
            if (prim.attributes.hasOwnProperty(attr)) {
                prim.attributes[attr] = gltf.accessors.findIndex(accessor => accessor.__id === prim.attributes[attr]);
            }
        }
        delete mesh.__id;
    }

    // Rebuild accessor-to-bufferview IDs
    for (const accessor of gltf.accessors) {
        accessor.bufferView = gltf.bufferViews.findIndex(bufferView => bufferView.__id === accessor.bufferView);
        delete accessor.__id;
    }

    // Rebuild bufferview-to-buffer IDs
    for (const bufferView of gltf.bufferViews) {
        bufferView.buffer = gltf.buffers.findIndex(buffer => buffer.__id === bufferView.buffer);
        delete bufferView.__id;
    }

    // Rebuild material-to-texture IDs
    for (const material of gltf.materials) {
        if (typeof material.pbrMetallicRoughness.baseColorTexture === 'number') {
            material.pbrMetallicRoughness.baseColorTexture = gltf.textures.findIndex(texture => texture.__id === material.pbrMetallicRoughness.baseColorTexture);
        }
        delete material.__id;
    }

    // Rebuild texture-to-image IDs
    for (const texture of gltf.textures) {
        if (typeof texture.source === 'number') {
            texture.source = gltf.images.findIndex(image => image.__id === texture.source);
        }
        delete texture.__id;
    }

    // Clean up all remaining temp IDs
    for (const buffer of gltf.buffers) {
        delete buffer.__id;
    }
    for (const image of gltf.images) {
        delete image.__id;
    }
}

async function extract(inputSqlitePath, newGltfPath) {
    let gltf = {
        asset: {
            version: '2.0',
            generator: 'forge-convert-utils',
            copyright: '2019 (c) Autodesk'
        },
        buffers: [], // indexed by buffer_views.buffer_id
        bufferViews: [], // indexed by accessors.buffer_view_id
        accessors: [], // indexed by  meshes.index_accessor_id, meshes.position_accessor_id, ...
        meshes: [], // indexed  by nodes.mesh_id
        materials: [], // indexed by meshes.material_id
        textures: [], // indexed by materials.base_color_texture_id
        images: [], // indexed by textures.source_id
        nodes: [],
        scenes: [{
            nodes: []
        }],
        scene: 0
    };
    try {
        const db = await setupDatabase(inputSqlitePath);
        const { meshSet } = await buildNodes(db, gltf, 'WHERE nodes.dbid < 4000');
        const { materialSet, accessorSet} = await buildMeshes(db, gltf, meshSet);
        const { bufferViewSet } = await buildAccessors(db, gltf, accessorSet);
        const { bufferSet } = await buildBufferViews(db, gltf, bufferViewSet);
        await buildBuffers(db, gltf, bufferSet);
        const { textureSet } = await buildMaterials(db, gltf, materialSet);
        const { imageSet } = await buildTextures(db, gltf, textureSet);
        await buildImages(db, gltf, imageSet);
        await closeDatabase(db);
        rebuildIndices(gltf);
        fse.writeJsonSync(newGltfPath, gltf, { spaces: 2 });
        console.log('Done!');
    } catch(err) {
        console.error(err);
    }
}

extract(process.argv[2], process.argv[3]);
