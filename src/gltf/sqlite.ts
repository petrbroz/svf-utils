import * as sqlite3 from 'sqlite3';
import * as gltf from './schema';
import { isUndefined } from 'util';
import { PropDbReader } from '../common/propdb-reader';

/**
 * Serializes glTF manifest into sqlite database on disk.
 * @async
 * @param {gltf.Gltf} gltf Original manifest.
 * @param {string} sqlitePath Path to local file where the sqlite database should be stored.
 * @param {PropDbReader} [pdb] Optional property reader for properties to be merged into the sqlite manifest.
 * @returns {Promise<void>} Promise that resolves after the database is created.
 */
export async function serialize(gltf: gltf.GlTf, sqlitePath: string, pdb?: PropDbReader): Promise<void> {
    const db = await openDatabase(sqlitePath);
    await serializeNodes(db, gltf);
    await serializeMeshes(db, gltf);
    await serializeAccessors(db, gltf);
    await serializeBufferViews(db, gltf);
    await serializeBuffers(db, gltf);
    await serializeMaterials(db, gltf);
    await serializeTextures(db, gltf);
    await serializeImages(db, gltf);
    if (pdb) {
        await serializeProperties(db, gltf, pdb);
    }
    await closeDatabase(db);
}

/**
 * Deserializes glTF manifest from sqlite database on disk.
 * @param {string} sqlitePath Path to local file the sqlite database should be read from.
 * @param {string | number[]} [filter] Optional filter of object IDs to include in the output gltf.
 * Can be either a sqlite query returning a list of dbIDs, or an array of dbIDs.
 * @example
 * const gltf = await deserialize('./data/model/manifest.sqlite', 'SELECT dbid FROM nodes WHERE dbid >= 1000 AND dbid <= 2000');
 * @example
 * const gltf = await deserialize('./data/model/manifest.sqlite', [100, 101, 102, 103]);
 */
export async function deserialize(sqlitePath: string, filter?: string | number[]): Promise<gltf.GlTf> {
    let gltf: gltf.GlTf = {
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
    const db = await openDatabase(sqlitePath);
    const { meshSet } = await deserializeNodes(db, gltf, filter);
    const { materialSet, accessorSet} = await deserializeMeshes(db, gltf, meshSet);
    const { bufferViewSet } = await deserializeAccessors(db, gltf, accessorSet);
    const { bufferSet } = await deserializeBufferViews(db, gltf, bufferViewSet);
    await deserializeBuffers(db, gltf, bufferSet);
    const { textureSet } = await deserializeMaterials(db, gltf, materialSet);
    const { imageSet } = await deserializeTextures(db, gltf, textureSet);
    await deserializeImages(db, gltf, imageSet);
    await closeDatabase(db);
    rebuildIndices(gltf);
    return gltf;
}

function openDatabase(sqlitePath: string): Promise<sqlite3.Database> {
    const db = new sqlite3.Database(sqlitePath);
    return new Promise(function (resolve, reject) {
        db.serialize(function () { resolve(db); });
    });
}

function closeDatabase(db: sqlite3.Database): Promise<void> {
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

function run(db: sqlite3.Database, sql: string): Promise<void> {
    return new Promise(function (resolve, reject) {
        db.run(sql, function (err: Error) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function serializeProperties(db: sqlite3.Database, gltf: gltf.GlTf, pdb: PropDbReader): Promise<void> {
    // Collect list of unique dbids already in the database
    const dbids = await readDbIds(db);

    // Add properties for each dbid
    await run(db, 'CREATE TABLE properties (dbid INTEGER, name TEXT, value TEXT)');
    let stmt = db.prepare('INSERT INTO properties VALUES (?, ?, ?)');
    for (const dbid of dbids) {
        const props = pdb.getProperties(dbid);
        for (const key of Object.keys(props)) {
            stmt.run(dbid, key, props[key]);
        }
    }
    return new Promise(function (resolve, reject) {
        stmt.finalize(function (err) {
            if (err) {
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function serializeImages(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE images (id INTEGER PRIMARY KEY, uri TEXT)');
    if (gltf.images) {
        let stmt = db.prepare('INSERT INTO images VALUES (?, ?)');
        for (let i = 0, len = gltf.images.length; i < len; i++) {
            const image = gltf.images[i];
            stmt.run(i, isUndefined(image.uri) ? null : image.uri);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeTextures(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE textures (id INTEGER PRIMARY KEY, source_id INTEGER)');
    if (gltf.textures) {
        let stmt = db.prepare('INSERT INTO textures VALUES (?, ?)');
        for (let i = 0, len = gltf.textures.length; i < len; i++) {
            const texture = gltf.textures[i];
            stmt.run(i, isUndefined(texture.source) ? null : texture.source);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeMaterials(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE materials (id INTEGER PRIMARY KEY, base_color_factor_r REAL, base_color_factor_g REAL, base_color_factor_b REAL, metallic_factor REAL, roughness_factor REAL, base_color_texture_id INTEGER, base_color_texture_uv INTEGER)');
    if (gltf.materials) {
        let stmt = db.prepare('INSERT INTO materials VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (let i = 0, len = gltf.materials.length; i < len; i++) {
            const material = gltf.materials[i];
            const pbr = material.pbrMetallicRoughness as gltf.MaterialPbrMetallicRoughness;
            const baseColorFactor = isUndefined(pbr.baseColorFactor) ? [null, null, null] : pbr.baseColorFactor;
            stmt.run(i, baseColorFactor[0], baseColorFactor[1], baseColorFactor[2], isUndefined(pbr.metallicFactor) ? null : pbr.metallicFactor, isUndefined(pbr.roughnessFactor) ? null : pbr.roughnessFactor, isUndefined(pbr.baseColorTexture) ? null : pbr.baseColorTexture.index, isUndefined(pbr.baseColorTexture) || isUndefined(pbr.baseColorTexture.texCoord) ? null : pbr.baseColorTexture.texCoord);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeBuffers(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE buffers (id INTEGER PRIMARY KEY, uri TEXT, byte_length INTEGER)');
    if (gltf.buffers) {
        let stmt = db.prepare('INSERT INTO buffers VALUES (?, ?, ?)');
        for (let i = 0, len = gltf.buffers.length; i < len; i++) {
            const buffer = gltf.buffers[i];
            stmt.run(i, isUndefined(buffer.uri) ? null : buffer.uri, buffer.byteLength);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeBufferViews(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE buffer_views (id INTEGER PRIMARY KEY, buffer_id INTEGER, byte_offset INTEGER, byte_length INTEGER)');
    if (gltf.bufferViews) {
        let stmt = db.prepare('INSERT INTO buffer_views VALUES (?, ?, ?, ?)');
        for (let i = 0, len = gltf.bufferViews.length; i < len; i++) {
            const bufferView = gltf.bufferViews[i];
            stmt.run(i, bufferView.buffer, isUndefined(bufferView.byteOffset) ? null : bufferView.byteOffset, bufferView.byteLength);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeAccessors(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE accessors (id INTEGER PRIMARY KEY, type TEXT, component_type INTEGER, count INTEGER, buffer_view_id INTEGER, min_x REAL, min_y REAL, min_z REAL, max_x REAL, max_y REAL, max_z REAL)');
    if (gltf.accessors) {
        let stmt = db.prepare('INSERT INTO accessors VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (let i = 0, len = gltf.accessors.length; i < len; i++) {
            const accessor = gltf.accessors[i];
            const min = isUndefined(accessor.min) ? [null, null, null] : accessor.min;
            const max = isUndefined(accessor.max) ? [null, null, null] : accessor.max;
            stmt.run(i, accessor.type, accessor.componentType, accessor.count, isUndefined(accessor.bufferView) ? null : accessor.bufferView, min[0], min[1], min[2], max[0], max[1], max[2]);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeMeshes(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE meshes (id INTEGER PRIMARY KEY, mode INTEGER, material_id INTEGER, index_accessor_id INTEGER, position_accessor_id INTEGER, normal_accessor_id INTEGER, uv_accessor_id INTEGER, color_accessor_id INTEGER)');
    if (gltf.meshes) {
        let stmt = db.prepare('INSERT INTO meshes VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (let i = 0, len = gltf.meshes.length; i < len; i++) {
            const mesh = gltf.meshes[i];
            const primitive = mesh.primitives[0] as gltf.MeshPrimitive; // Assuming we only have one primitive per mesh
            if (!primitive) {
                // Primitive can be undefined if the exporter is configured to ignore mesh, line, or point geometry
                stmt.run(i, null, null, null, null, null, null, null);
            }
            else {
                stmt.run(i, isUndefined(primitive.mode) ? null : primitive.mode, isUndefined(primitive.material) ? null : primitive.material, isUndefined(primitive.indices) ? null : primitive.indices, isUndefined(primitive.attributes['POSITION']) ? null : primitive.attributes['POSITION'], isUndefined(primitive.attributes['NORMAL']) ? null : primitive.attributes['NORMAL'], isUndefined(primitive.attributes['TEXCOORD_0']) ? null : primitive.attributes['TEXCOORD_0'], isUndefined(primitive.attributes['COLOR_0']) ? null : primitive.attributes['COLOR_0']);
            }
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

async function serializeNodes(db: sqlite3.Database, gltf: gltf.GlTf): Promise<void> {
    await run(db, 'CREATE TABLE nodes (id INTEGER PRIMARY KEY, dbid INTEGER, mesh_id INTEGER, matrix_json TEXT, translation_x REAL, translation_y REAL, translation_z REAL, scale_x REAL, scale_y REAL, scale_z REAL, rotation_x REAL, rotation_y REAL, rotation_z REAL, rotation_w REAL)');
    if (gltf.nodes) {
        let stmt = db.prepare('INSERT INTO nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (let i = 0, len = gltf.nodes.length; i < len; i++) {
            const node = gltf.nodes[i];
            const translation = isUndefined(node.translation) ? [null, null, null] : node.translation;
            const scale = isUndefined(node.scale) ? [null, null, null] : node.scale;
            const rotation = isUndefined(node.rotation) ? [null, null, null, null] : node.rotation;
            stmt.run(i, isUndefined(node.name) ? null : parseInt(node.name), isUndefined(node.mesh) ? null : node.mesh, isUndefined(node.matrix) ? null : JSON.stringify(node.matrix), translation[0], translation[1], translation[2], scale[0], scale[1], scale[2], rotation[0], rotation[1], rotation[2], rotation[3]);
        }
        return new Promise(function (resolve, reject) {
            stmt.finalize(function (err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    } else {
        return Promise.resolve();
    }
}

function deserializeNodes(db: sqlite3.Database, gltf: gltf.GlTf, filter?: string | number[]): Promise<{ count: number; meshSet: Set<number> }> {
    const meshSet = new Set<number>(); // Set of all mesh IDs to be returned by this function's promise
    const nodes = gltf.nodes as gltf.Node[];
    const scene = (gltf.scenes as gltf.Scene[])[0];
    let query = `
        SELECT id, dbid, mesh_id, matrix_json AS mtx, translation_x AS tx, translation_y AS ty, translation_z AS tz, scale_x AS sx, scale_y AS sy, scale_z AS sz, rotation_x AS rx, rotation_y AS ry, rotation_z AS rz, rotation_w AS rw
        FROM nodes
        ${filter ? `WHERE dbid IN (${typeof filter === 'string' ? filter : filter.join(',')})` : ''}
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let node: gltf.Node = {
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
            const id = nodes.push(node) - 1;
            (scene.nodes as number[]).push(id);
            meshSet.add(node.mesh as number);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, meshSet });
            }
        });
    });
}

function deserializeMeshes(db: sqlite3.Database, gltf: gltf.GlTf, meshSet: Set<number>): Promise<{ count: number; materialSet: Set<number>; accessorSet: Set<number> }> {
    const materialSet = new Set<number>(); // Set of all material IDs to be returned by this function's promise
    const accessorSet = new Set<number>(); // Set of all accessor IDs to be returned by this function's promise
    const meshes = gltf.meshes as gltf.Mesh[];
    const query = `
        SELECT id, mode, material_id, index_accessor_id, position_accessor_id, normal_accessor_id, uv_accessor_id, color_accessor_id
        FROM meshes
        WHERE id IN (${Array.from(meshSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let mesh: gltf.Mesh = {
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
                accessorSet.add(prim.indices as number);
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
            meshes.push(mesh);
            materialSet.add(prim.material as number);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, materialSet, accessorSet });
            }
        });
    });
}

function deserializeAccessors(db: sqlite3.Database, gltf: gltf.GlTf, accessorSet: Set<number>): Promise<{ count: number; bufferViewSet: Set<number> }> {
    const bufferViewSet = new Set<number>(); // Set of all buffer view IDs to be returned by this function's promise
    const accessors = gltf.accessors as gltf.Accessor[];
    const query = `
        SELECT id, type, component_type, count, buffer_view_id, min_x, min_y, min_z, max_x, max_y, max_z
        FROM accessors
        WHERE id IN (${Array.from(accessorSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let accessor: gltf.Accessor = {
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
            accessors.push(accessor);
            bufferViewSet.add(accessor.bufferView as number);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, bufferViewSet });
            }
        });
    });
}

function deserializeBufferViews(db: sqlite3.Database, gltf: gltf.GlTf, bufferViewSet: Set<number>): Promise<{ count: number; bufferSet: Set<number> }> {
    const bufferSet = new Set<number>(); // Set of all buffer IDs to be returned by this function's promise
    const bufferViews = gltf.bufferViews as gltf.BufferView[];
    const query = `
        SELECT id, buffer_id, byte_offset, byte_length
        FROM buffer_views
        WHERE id IN (${Array.from(bufferViewSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let bufferView: gltf.BufferView = {
                __id: row.id,
                buffer: row.buffer_id,
                byteOffset: row.byte_offset,
                byteLength: row.byte_length
            };
            bufferViews.push(bufferView);
            bufferSet.add(bufferView.buffer);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, bufferSet });
            }
        });
    });
}

function deserializeBuffers(db: sqlite3.Database, gltf: gltf.GlTf, bufferSet: Set<number>): Promise<{ count: number }> {
    const buffers = gltf.buffers as gltf.Buffer[];
    const query = `
        SELECT id, uri, byte_length
        FROM buffers
        WHERE id IN (${Array.from(bufferSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let buffer = {
                __id: row.id,
                uri: row.uri,
                byteLength: row.byte_length
            };
            buffers.push(buffer);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count });
            }
        });
    });
}

function deserializeMaterials(db: sqlite3.Database, gltf: gltf.GlTf, materialSet: Set<number>): Promise<{ count: number; textureSet: Set<number> }> {
    const textureSet = new Set<number>(); // Set of all texture IDs to be returned by this function's promise
    const materials = gltf.materials as gltf.MaterialPbrMetallicRoughness[];
    const query = `
        SELECT id, base_color_factor_r, base_color_factor_g, base_color_factor_b, metallic_factor, roughness_factor, base_color_texture_id, base_color_texture_uv
        FROM materials
        WHERE id IN (${Array.from(materialSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let material: gltf.MaterialPbrMetallicRoughness = {
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
            materials.push(material);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, textureSet });
            }
        });
    });
}

function deserializeTextures(db: sqlite3.Database, gltf: gltf.GlTf, textureSet: Set<number>): Promise<{ count: number; imageSet: Set<number> }> {
    const imageSet = new Set<number>(); // Set of all image IDs to be returned by this function's promise
    const textures = gltf.textures as gltf.Texture[];
    const query = `
        SELECT id, source_id
        FROM textures
        WHERE id IN (${Array.from(textureSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let texture: gltf.Texture = {
                __id: row.id,
                source: row.source_id
            };
            textures.push(texture);
            imageSet.add(texture.source as number);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count, imageSet });
            }
        });
    });
}

function deserializeImages(db: sqlite3.Database, gltf: gltf.GlTf, imageSet: Set<number>): Promise<{ count: number }> {
    const images = gltf.images as gltf.Image[];
    const query = `
        SELECT id, uri
        FROM images
        WHERE id IN (${Array.from(imageSet.values()).join(',')})
    `;
    const onRow = (err: Error, row: any) => {
        if (err) {
            console.error(err);
        } else {
            let image: gltf.Image = {
                __id: row.id,
                uri: row.uri
            };
            images.push(image);
        }
    }
    return new Promise(function (resolve, reject) {
        db.each(query, [], onRow, function onComplete (err: Error, count: number) {
            if (err) {
                reject(err);
            } else {
                resolve({ count });
            }
        });
    });
}

function rebuildIndices(gltf: gltf.GlTf) {
    const nodes = gltf.nodes as gltf.Node[];
    const meshes = gltf.meshes as gltf.Mesh[];
    const accessors = gltf.accessors as gltf.Accessor[];
    const bufferViews = gltf.bufferViews as gltf.BufferView[];
    const buffers = gltf.buffers as gltf.Buffer[];
    const materials = gltf.materials as gltf.MaterialPbrMetallicRoughness[];
    const textures = gltf.textures as gltf.Texture[];
    const images = gltf.images as gltf.Image[];

    // Rebuild node-to-mesh IDs
    for (const node of nodes) {
        node.mesh = meshes.findIndex(mesh => mesh.__id === node.mesh);
        delete node.__id;
    }

    // Rebuild mesh-to-accessor and mesh-to-material IDs
    for (const mesh of meshes) {
        const prim = mesh.primitives[0];
        if (typeof prim.material === 'number') {
            prim.material = materials.findIndex(material => material.__id === prim.material);
        }
        if (typeof prim.indices === 'number') {
            prim.indices = accessors.findIndex(accessor => accessor.__id === prim.indices);
        }
        for (const attr of ['POSITION', 'NORMAL', 'TEXCOORD_0', 'COLOR_0']) {
            if (prim.attributes.hasOwnProperty(attr)) {
                prim.attributes[attr] = accessors.findIndex(accessor => accessor.__id === prim.attributes[attr]);
            }
        }
        delete mesh.__id;
    }

    // Rebuild accessor-to-bufferview IDs
    for (const accessor of accessors) {
        accessor.bufferView = bufferViews.findIndex(bufferView => bufferView.__id === accessor.bufferView);
        delete accessor.__id;
    }

    // Rebuild bufferview-to-buffer IDs
    for (const bufferView of bufferViews) {
        bufferView.buffer = buffers.findIndex(buffer => buffer.__id === bufferView.buffer);
        delete bufferView.__id;
    }

    // Rebuild material-to-texture IDs
    for (const material of materials) {
        if (material.pbrMetallicRoughness.baseColorTexture) {
            const { baseColorTexture } = material.pbrMetallicRoughness;
            baseColorTexture.index = textures.findIndex(texture => texture.__id === baseColorTexture.index);
        }
        delete material.__id;
    }

    // Rebuild texture-to-image IDs
    for (const texture of textures) {
        if (typeof texture.source === 'number') {
            texture.source = images.findIndex(image => image.__id === texture.source);
        }
        delete texture.__id;
    }

    // Clean up all remaining temp IDs
    for (const buffer of buffers) {
        delete buffer.__id;
    }
    for (const image of images) {
        delete image.__id;
    }
}

function readDbIds(db: sqlite3.Database): Promise<number[]> {
    let query = `
        SELECT DISTINCT dbid
        FROM nodes
    `;
    return new Promise(function (resolve, reject) {
        db.all(query, function onComplete(err: Error, rows: any[]) {
            if (err) {
                reject(err);
            } else {
                resolve(rows.map(row => row.dbid));
            }
        });
    });
}
