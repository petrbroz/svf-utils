import * as path from 'path';
import * as crypto from 'crypto';
import * as fse from 'fs-extra';
import * as pipeline from 'gltf-pipeline';

import * as gltf from './schema';
import { isUndefined, isNullOrUndefined } from 'util';
import { IMaterial, IFragment, IMesh, ILines, IPoints, IMaterialMap } from '../svf/schema';
import { ISvfContent } from '../svf/reader';

const MaxBufferSize = 5 << 20;
const DefaultMaterial: gltf.MaterialPbrMetallicRoughness = {
    pbrMetallicRoughness: {
        baseColorFactor: [0.25, 0.25, 0.25, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.5
    }
};

export interface IWriterOptions {
    maxBufferSize?: number; /** Approx. size limit (in bytes) of binary buffers with mesh data (5 << 20 by default) */
    ignoreMeshGeometry?: boolean; /** Don't output mesh geometry */
    ignoreLineGeometry?: boolean; /** Don't output line geometry */
    ignorePointGeometry?: boolean; /** Don't output point geometry */
    deduplicate?: boolean; /** Find and remove mesh geometry duplicates (increases the processing time) */
    compress?: boolean; /** Compress output using Draco. */
    binary?: boolean; /** Output GLB instead of GLTF. */
}

/**
 * Utility class for serializing SVF content to local file system as glTF (2.0).
 */
export class Writer {
    protected baseDir: string;
    protected manifest: gltf.GlTf;
    protected downloads: Promise<string>[] = [];
    protected bufferStream: fse.WriteStream | null;
    protected bufferSize: number;
    protected maxBufferSize: number;
    protected ignoreMeshGeometry: boolean;
    protected ignoreLineGeometry: boolean;
    protected ignorePointGeometry: boolean;
    protected deduplicate: boolean;
    protected compress: boolean;
    protected binary: boolean;

    private hashMeshCache /* :D */ = new Map<string, gltf.Mesh>();
    private completeBuffers: Promise<void>[] = [];

    /**
     * Initializes the writer.
     * @param {string} dir Output folder for the glTF manifest and all its assets.
     * @param {IWriterOptions} [options={}] Additional writer options.
     */
    constructor(dir: string, options: IWriterOptions = {}) {
        this.maxBufferSize = isNullOrUndefined(options.maxBufferSize) ? MaxBufferSize : options.maxBufferSize;
        this.ignoreMeshGeometry = !!options.ignoreMeshGeometry;
        this.ignoreLineGeometry = !!options.ignoreLineGeometry;
        this.ignorePointGeometry = !!options.ignorePointGeometry;
        this.deduplicate = !!options.deduplicate;
        this.compress = !!options.compress;
        this.binary = !!options.binary;
        this.manifest = {
            asset: {
                version: '2.0',
                generator: 'forge-svf-utils',
                copyright: '2019 (c) Autodesk'
            },
            buffers: [],
            bufferViews: [],
            accessors: [],
            meshes: [],
            materials: [],
            nodes: [],
            scenes: [],
            textures: [],
            images: [],
            scene: 0 // For now, we always mark the first scene as the default one
        };
        this.bufferStream = null;
        this.bufferSize = 0;
        this.baseDir = (this.compress || this.binary) ? path.join(dir, 'tmp') : dir;
    }

    /**
     * Outputs entire SVF as a glTF scene.
     * Can be called multiple times to create a glTF with multiple scenes.
     * @param {ISvfContent} svf SVF content loaded in memory.
     */
    write(svf: ISvfContent) {
        let scene: gltf.Scene = {
            nodes: []
        };
        const manifestNodes = this.manifest.nodes as gltf.Node[];
        const manifestMaterials = this.manifest.materials as gltf.MaterialPbrMetallicRoughness[];

        fse.ensureDirSync(this.baseDir);

        for (const fragment of svf.fragments) {
            const node = this.writeFragment(fragment, svf);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                const index = manifestNodes.length;
                manifestNodes.push(node);
                (scene.nodes as number[]).push(index);
            }
        }

        for (const material of svf.materials) {
            const mat = this.writeMaterial(material, svf);
            manifestMaterials.push(mat);
        }

        const manifestScenes = this.manifest.scenes as gltf.Scene[];
        manifestScenes.push(scene);
    }

    /**
     * Finalizes the glTF output.
     */
    async close() {
        if (this.bufferStream) {
            const stream = this.bufferStream as fse.WriteStream;
            this.completeBuffers.push(new Promise((resolve, reject) => {
                stream.on('finish', resolve);
            }));
            this.bufferStream.close();
            this.bufferStream = null;
            this.bufferSize = 0;
        }

        await Promise.all(this.completeBuffers);
        const gltfPath = path.join(this.baseDir, 'output.gltf');
        fse.writeFileSync(gltfPath, JSON.stringify(this.manifest, null, 4));

        if (this.compress || this.binary) {
            const options: any = {
                resourceDirectory: this.baseDir,
                separate: false,
                separateTextures: false,
                stats: false,
                name: 'output'
            };
            if (this.compress) {
                options.dracoOptions = {
                    compressionLevel: 10
                };
            }
            /*
             * For some reason, when trying to use the manifest that's already in memory,
             * the call to gltfToGlb fails with "Draco Runtime Error". When we re-read
             * the manifest we just serialized couple lines above, gltfToGlb works fine...
             */
            const manifest = fse.readJsonSync(gltfPath);
            const newPath = this.baseDir.replace(/tmp$/, this.binary ? 'output.glb' : 'output.gltf');
            try {
                if (this.binary) {
                    const result = await pipeline.gltfToGlb(manifest, options);
                    fse.writeFileSync(newPath, result.glb);
                    // Delete the original gltf file
                    fse.unlinkSync(gltfPath);
                } else {
                    const result = await pipeline.processGltf(manifest, options);
                    fse.writeJsonSync(newPath, result.gltf);
                }
                fse.removeSync(this.baseDir);
            } catch(err) {
                console.error('Could not post-process the output', err);
            }
        }
    }

    protected writeFragment(fragment: IFragment, svf: ISvfContent): gltf.Node {
        let node: gltf.Node = {
            name: fragment.dbID.toString()
        };

        if (fragment.transform) {
            const xform = fragment.transform as any;
            if ('t' in xform) {
                const t = xform.t;
                node.translation = [t.x, t.y, t.z];
            }
            if ('s' in xform) {
                const s = xform.s;
                node.scale = [s.x, s.y, s.z];
            }
            if ('q' in xform) {
                const q = xform.q;
                node.rotation = [q.x, q.y, q.z, q.w];
            }
            if ('matrix' in xform) {
                const m = xform.matrix;
                const t = xform.t;
                node.matrix = [
                    m[0], m[3], m[6], 0,
                    m[1], m[4], m[7], 0,
                    m[2], m[5], m[8], 0,
                    t.x, t.y, t.z, 1
                ]; // 4x4, column major
                delete node.translation; // Translation is already included in the 4x4 matrix
            }
        }

        const geometry = svf.geometries[fragment.geometryID];
        const fragmesh = svf.meshpacks[geometry.packID][geometry.entityID];
        const manifestMeshes = this.manifest.meshes as gltf.Mesh[];
        if (fragmesh) {
            let mesh: gltf.Mesh;
            if ('isLines' in fragmesh) {
                mesh = this.writeLineGeometry(fragmesh, svf);
            } else if ('isPoints' in fragmesh) {
                mesh = this.writePointGeometry(fragmesh, svf);
            } else {
                if (this.deduplicate) {
                    // Check if a similar already exists
                    const hash = this.computeMeshHash(fragmesh);
                    const cache = this.hashMeshCache.get(hash);
                    if (cache) {
                        mesh = cache;
                    } else {
                        mesh = this.writeMeshGeometry(fragmesh, svf);
                        this.hashMeshCache.set(hash, mesh);
                    }
                } else {
                    mesh = this.writeMeshGeometry(fragmesh, svf);
                }
            }
            node.mesh = manifestMeshes.length;
            manifestMeshes.push(mesh);
            for (const primitive of mesh.primitives) {
                primitive.material = fragment.materialID;
            }
        } else {
            console.warn('Could not find mesh for fragment', fragment, 'geometry', geometry);
        }
        return node;
    }

    protected writeMeshGeometry(fragmesh: IMesh, svf: ISvfContent): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.ignoreMeshGeometry) {
            return mesh;
        }

        const manifestBuffers = this.manifest.buffers as gltf.Buffer[];

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > this.maxBufferSize) {
            if (this.bufferStream) {
                const stream = this.bufferStream as fse.WriteStream;
                this.completeBuffers.push(new Promise((resolve, reject) => {
                    stream.on('finish', resolve);
                }));
                this.bufferStream.close();
                this.bufferStream = null;
                this.bufferSize = 0;
            }
            const bufferUri = `${manifestBuffers.length}.bin`;
            manifestBuffers.push({ uri: bufferUri, byteLength: 0 });
            const bufferPath = path.join(this.baseDir, bufferUri);
            this.bufferStream = fse.createWriteStream(bufferPath);
        }

        const bufferID = manifestBuffers.length - 1;
        const buffer = manifestBuffers[bufferID];
        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];
        const hasUVs = fragmesh.uvmaps && fragmesh.uvmaps.length > 0;

        const indexBufferViewID = bufferViews.length;
        let indexBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(indexBufferView);

        const positionBufferViewID = bufferViews.length;
        let positionBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(positionBufferView);

        const normalBufferViewID = bufferViews.length;
        let normalBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(normalBufferView);

        let uvBufferViewID, uvBufferView;
        if (hasUVs) {
            uvBufferViewID = bufferViews.length;
            uvBufferView = {
                buffer: bufferID,
                byteOffset: -1,
                byteLength: -1
            };
            bufferViews.push(uvBufferView);
        }

        const indexAccessorID = accessors.length;
        let indexAccessor = {
            bufferView: indexBufferViewID,
            componentType: 5123, // UNSIGNED_SHORT
            count: -1,
            type: 'SCALAR'
        };
        accessors.push(indexAccessor);

        const positionAccessorID = accessors.length;
        let positionAccessor = {
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3',
            min: [fragmesh.min.x, fragmesh.min.y, fragmesh.min.z],
            max: [fragmesh.max.x, fragmesh.max.y, fragmesh.max.z]
        };
        accessors.push(positionAccessor);

        const normalAccessorID = accessors.length;
        let normalAccessor = {
            bufferView: normalBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3'
        };
        accessors.push(normalAccessor);

        mesh.primitives.push({
            attributes: {
                POSITION: positionAccessorID,
                NORMAL: normalAccessorID
            },
            indices: indexAccessorID
        });

        let uvAccessorID, uvAccessor;
        if (hasUVs) {
            uvAccessorID = accessors.length;
            uvAccessor = {
                bufferView: uvBufferViewID,
                componentType: 5126, // FLOAT
                count: -1,
                type: 'VEC2'
            };
            accessors.push(uvAccessor);
            mesh.primitives[0].attributes.TEXCOORD_0 = uvAccessorID;
        }

        // Indices
        const indices = Buffer.from(fragmesh.indices.buffer);
        this.bufferStream.write(indices);
        this.bufferSize += indices.byteLength;
        indexAccessor.count = indices.byteLength / 2;
        indexBufferView.byteOffset = buffer.byteLength;
        indexBufferView.byteLength = indices.byteLength;
        buffer.byteLength += indices.byteLength;
        if (buffer.byteLength % 4 !== 0) {
            // Pad to 4-byte multiples
            const pad = 4 - buffer.byteLength % 4;
            this.bufferStream.write(new Uint8Array(pad));
            this.bufferSize += pad;
            buffer.byteLength += pad;
        }

        // Vertices
        const vertices = Buffer.from(fragmesh.vertices.buffer);
        this.bufferStream.write(vertices);
        this.bufferSize += vertices.byteLength;
        positionAccessor.count = vertices.byteLength / 4 / 3;
        positionBufferView.byteOffset = buffer.byteLength;
        positionBufferView.byteLength = vertices.byteLength;
        buffer.byteLength += vertices.byteLength;

        // Normals
        if (fragmesh.normals) {
            const normals = Buffer.from(fragmesh.normals.buffer);
            this.bufferStream.write(normals);
            this.bufferSize += normals.byteLength;
            normalAccessor.count = normals.byteLength / 4 / 3;
            normalBufferView.byteOffset = buffer.byteLength;
            normalBufferView.byteLength = normals.byteLength;
            buffer.byteLength += normals.byteLength;
        }

        // UVs (only the first UV map if there's one)
        if (hasUVs && !isUndefined(uvAccessor) && !isUndefined(uvBufferView)) {
            const uvs = Buffer.from(fragmesh.uvmaps[0].uvs.buffer);
            this.bufferStream.write(uvs);
            this.bufferSize += uvs.byteLength;
            uvAccessor.count = uvs.byteLength / 4 / 2;
            uvBufferView.byteOffset = buffer.byteLength;
            uvBufferView.byteLength = uvs.byteLength;
            buffer.byteLength += uvs.byteLength;
        }
        return mesh;
    }

    protected writeLineGeometry(fragmesh: ILines, svf: ISvfContent): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.ignoreLineGeometry) {
            return mesh;
        }

        const manifestBuffers = this.manifest.buffers as gltf.Buffer[];

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > this.maxBufferSize) {
            if (this.bufferStream) {
                const stream = this.bufferStream as fse.WriteStream;
                this.completeBuffers.push(new Promise((resolve, reject) => {
                    stream.on('finish', resolve);
                }));
                this.bufferStream.close();
                this.bufferStream = null;
                this.bufferSize = 0;
            }
            const bufferUri = `${manifestBuffers.length}.bin`;
            manifestBuffers.push({ uri: bufferUri, byteLength: 0 });
            const bufferPath = path.join(this.baseDir, bufferUri);
            this.bufferStream = fse.createWriteStream(bufferPath);
        }

        const bufferID = manifestBuffers.length - 1;
        const buffer = manifestBuffers[bufferID];
        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];

        const indexBufferViewID = bufferViews.length;
        let indexBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(indexBufferView);

        const positionBufferViewID = bufferViews.length;
        let positionBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(positionBufferView);

        const indexAccessorID = accessors.length;
        let indexAccessor = {
            bufferView: indexBufferViewID,
            componentType: 5123, // UNSIGNED_SHORT
            count: -1,
            type: 'SCALAR'
        };
        accessors.push(indexAccessor);

        const positionAccessorID = accessors.length;
        let positionAccessor = {
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3',
            //min: // TODO
            //max: // TODO
        };
        accessors.push(positionAccessor);

        mesh.primitives.push({
            mode: 1, // LINES
            attributes: {
                POSITION: positionAccessorID
            },
            indices: indexAccessorID
        });

        // Indices
        const indices = Buffer.from(fragmesh.indices.buffer);
        this.bufferStream.write(indices);
        this.bufferSize += indices.byteLength;
        indexAccessor.count = indices.byteLength / 2;
        indexBufferView.byteOffset = buffer.byteLength;
        indexBufferView.byteLength = indices.byteLength;
        buffer.byteLength += indices.byteLength;
        if (buffer.byteLength % 4 !== 0) {
            // Pad to 4-byte multiples
            const pad = 4 - buffer.byteLength % 4;
            this.bufferStream.write(new Uint8Array(pad));
            this.bufferSize += pad;
            buffer.byteLength += pad;
        }

        // Vertices
        const vertices = Buffer.from(fragmesh.vertices.buffer);
        this.bufferStream.write(vertices);
        this.bufferSize += vertices.byteLength;
        positionAccessor.count = vertices.byteLength / 4 / 3;
        positionBufferView.byteOffset = buffer.byteLength;
        positionBufferView.byteLength = vertices.byteLength;
        buffer.byteLength += vertices.byteLength;

        // Colors, if available
        if (fragmesh.colors) {
            const colorBufferViewID = bufferViews.length;
            let colorBufferView = {
                buffer: bufferID,
                byteOffset: -1,
                byteLength: -1
            };
            bufferViews.push(colorBufferView);

            const colorAccessorID = accessors.length;
            let colorAccessor = {
                bufferView: colorBufferViewID,
                componentType: 5126, // FLOAT
                count: -1,
                type: 'VEC3',
                //min: // TODO
                //max: // TODO
            };
            accessors.push(colorAccessor);

            mesh.primitives[0].attributes['COLOR_0'] = colorAccessorID;

            const colors = Buffer.from(fragmesh.colors.buffer);
            this.bufferStream.write(colors);
            this.bufferSize += colors.byteLength;
            colorAccessor.count = colors.byteLength / 4 / 3;
            colorBufferView.byteOffset = buffer.byteLength;
            colorBufferView.byteLength = colors.byteLength;
            buffer.byteLength += colors.byteLength;
        }

        return mesh;
    }

    protected writePointGeometry(fragmesh: IPoints, svf: ISvfContent): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.ignorePointGeometry) {
            return mesh;
        }

        const manifestBuffers = this.manifest.buffers as gltf.Buffer[];

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > this.maxBufferSize) {
            if (this.bufferStream) {
                const stream = this.bufferStream as fse.WriteStream;
                this.completeBuffers.push(new Promise((resolve, reject) => {
                    stream.on('finish', resolve);
                }));
                this.bufferStream.close();
                this.bufferStream = null;
                this.bufferSize = 0;
            }
            const bufferUri = `${manifestBuffers.length}.bin`;
            manifestBuffers.push({ uri: bufferUri, byteLength: 0 });
            const bufferPath = path.join(this.baseDir, bufferUri);
            this.bufferStream = fse.createWriteStream(bufferPath);
        }

        const bufferID = manifestBuffers.length - 1;
        const buffer = manifestBuffers[bufferID];
        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];

        const positionBufferViewID = bufferViews.length;
        let positionBufferView = {
            buffer: bufferID,
            byteOffset: -1,
            byteLength: -1
        };
        bufferViews.push(positionBufferView);

        const positionAccessorID = accessors.length;
        let positionAccessor = {
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: -1,
            type: 'VEC3',
            //min: // TODO
            //max: // TODO
        };
        accessors.push(positionAccessor);

        mesh.primitives.push({
            mode: 0, // POINTS
            attributes: {
                POSITION: positionAccessorID
            }
        });

        // Vertices
        const vertices = Buffer.from(fragmesh.vertices.buffer);
        this.bufferStream.write(vertices);
        this.bufferSize += vertices.byteLength;
        positionAccessor.count = vertices.byteLength / 4 / 3;
        positionBufferView.byteOffset = buffer.byteLength;
        positionBufferView.byteLength = vertices.byteLength;
        buffer.byteLength += vertices.byteLength;

        // Colors, if available
        if (fragmesh.colors) {
            const colorBufferViewID = bufferViews.length;
            let colorBufferView = {
                buffer: bufferID,
                byteOffset: -1,
                byteLength: -1
            };
            bufferViews.push(colorBufferView);

            const colorAccessorID = accessors.length;
            let colorAccessor = {
                bufferView: colorBufferViewID,
                componentType: 5126, // FLOAT
                count: -1,
                type: 'VEC3',
                //min: // TODO
                //max: // TODO
            };
            accessors.push(colorAccessor);

            mesh.primitives[0].attributes['COLOR_0'] = colorAccessorID;

            const colors = Buffer.from(fragmesh.colors.buffer);
            this.bufferStream.write(colors);
            this.bufferSize += colors.byteLength;
            colorAccessor.count = colors.byteLength / 4 / 3;
            colorBufferView.byteOffset = buffer.byteLength;
            colorBufferView.byteLength = colors.byteLength;
            buffer.byteLength += colors.byteLength;
        }

        return mesh;
    }

    protected writeMaterial(mat: IMaterial | null, svf: ISvfContent): gltf.MaterialPbrMetallicRoughness {
        if (!mat) {
            return DefaultMaterial;
        }

        let material: gltf.MaterialPbrMetallicRoughness = {
            pbrMetallicRoughness: {
                baseColorFactor: mat.diffuse,
                metallicFactor: mat.metal ? 1.0 : 0.0,
                // roughnessFactor: (mat.glossiness || 0) / 255.0
            }
        };
        if (!isUndefined(mat.opacity) && material.pbrMetallicRoughness.baseColorFactor) {
            material.alphaMode = 'BLEND';
            material.pbrMetallicRoughness.baseColorFactor[3] = mat.opacity;
        }

        if (mat.maps) {
            const manifestTextures = this.manifest.textures as gltf.Texture[];
            if (mat.maps.diffuse) {
                const textureID = manifestTextures.length;
                manifestTextures.push(this.writeTexture(mat.maps.diffuse, svf));
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: textureID,
                    texCoord: 0
                };
            }
        }
        return material;
    }

    protected writeTexture(map: IMaterialMap, svf: ISvfContent): gltf.Texture {
        const manifestImages = this.manifest.images as gltf.Image[];
        let imageID = manifestImages.findIndex(image => image.uri === map.uri);
        if (imageID === -1) {
            imageID = manifestImages.length;
            const normalizedUri = map.uri.toLowerCase().split(/[\/\\]/).join(path.sep);
            manifestImages.push({ uri: normalizedUri });
            const filePath = path.join(this.baseDir, normalizedUri);
            fse.ensureDirSync(path.dirname(filePath));
            fse.writeFileSync(filePath, svf.images[normalizedUri]);
        }
        return { source: imageID };
    }

    /**
     * Computes a hash for given mesh by combining values like vertex count and
     * triangle count with an MD5 hash of the actual index/vertex/normal/uv buffer data.
     * Some properties (attrs, comments, min, max) are not included in the hash.
     * @param {IMesh} mesh Input mesh.
     * @returns {string} Hash-like string that can be used for caching the mesh.
     */
    private computeMeshHash(mesh: IMesh): string {
        const hash = crypto.createHash('md5');
        const { vcount, tcount, uvcount, attrs, flags, comment, min, max } = mesh;
        hash.update(mesh.vertices);
        hash.update(mesh.indices);
        for (const uvmap of mesh.uvmaps) {
            hash.update(uvmap.uvs);
        }
        if (mesh.normals) {
            hash.update(mesh.normals);
        }
        return [vcount, tcount, uvcount, flags, hash.digest('hex')].join('/');
    }
}
