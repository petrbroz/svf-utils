import * as path from 'path';
import crypto from 'crypto';
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
    log?: (msg: string) => void; /** Optional logging function. */
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
    protected log: (msg: string) => void;

    private bufferViewCache = new Map<string, gltf.BufferView>();
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
        this.log = (options && options.log) || function (msg: string) {};
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

        this.log(`Writing scene...`);
        for (const fragment of svf.fragments) {
            const node = this.writeFragment(fragment, svf);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                const index = manifestNodes.length;
                manifestNodes.push(node);
                (scene.nodes as number[]).push(index);
            }
        }

        if (this.deduplicate) {
            const hashes: string[] = [];
            const newMaterialIndices = new Uint16Array(svf.materials.length);
            for (let i = 0, len = svf.materials.length; i < len; i++) {
                const material = svf.materials[i];
                const hash = this.computeMaterialHash(material);
                const match = hashes.indexOf(hash);
                if (match === -1) {
                    // If this is a first occurrence of the hash in the array, output a new material
                    newMaterialIndices[i] = manifestMaterials.length;
                    manifestMaterials.push(this.writeMaterial(material, svf));
                    hashes.push(hash);
                } else {
                    // Otherwise skip the material, and record an index to the first match below
                    this.log(`Skipping a duplicate material (hash: ${hash})`);
                    newMaterialIndices[i] = match;
                }
            }
            // Update material indices in all mesh primitives
            for (const mesh of (this.manifest.meshes as gltf.Mesh[])) {
                for (const primitive of mesh.primitives) {
                    if (!isUndefined(primitive.material)) {
                        primitive.material = newMaterialIndices[primitive.material];
                    }
                }
            }
        } else {
            for (const material of svf.materials) {
                const mat = this.writeMaterial(material, svf);
                manifestMaterials.push(mat);
            }
        }

        const manifestScenes = this.manifest.scenes as gltf.Scene[];
        manifestScenes.push(scene);
        this.log(`Writing scene: done`);
    }

    /**
     * Finalizes the glTF output.
     */
    async close() {
        this.log(`Closing gltf output...`);
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
        this.log(`Closing gltf output: done`);

        if (this.compress || this.binary) {
            this.log(`Post-processing gltf output...`);
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
            this.log(`Post-processing gltf output: done`);
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
                mesh = this.writeMeshGeometry(fragmesh, svf);
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

        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];

        // Output index buffer
        const indexBufferViewID = bufferViews.length;
        const indexBufferView = this.writeBufferView(Buffer.from(fragmesh.indices.buffer));
        bufferViews.push(indexBufferView);
        const indexAccessorID = accessors.length;
        accessors.push({
            bufferView: indexBufferViewID,
            componentType: 5123, // UNSIGNED_SHORT
            count: indexBufferView.byteLength / 2,
            type: 'SCALAR'
        });

        // Output vertex buffer
        const positionBufferViewID = bufferViews.length;
        const positionBufferView = this.writeBufferView(Buffer.from(fragmesh.vertices.buffer));
        bufferViews.push(positionBufferView);
        const positionAccessorID = accessors.length;
        accessors.push({
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: positionBufferView.byteLength / 4 / 3,
            type: 'VEC3',
            min: [fragmesh.min.x, fragmesh.min.y, fragmesh.min.z],
            max: [fragmesh.max.x, fragmesh.max.y, fragmesh.max.z]
        });

        // Output normals buffer
        let normalAccessorID: number | undefined = undefined;
        if (fragmesh.normals) {
            const normalBufferViewID = bufferViews.length;
            const normalBufferView = this.writeBufferView(Buffer.from(fragmesh.normals.buffer));
            bufferViews.push(normalBufferView);
            normalAccessorID = accessors.length;
            accessors.push({
                bufferView: normalBufferViewID,
                componentType: 5126, // FLOAT
                count: normalBufferView.byteLength / 4 / 3,
                type: 'VEC3'
            });
        }

        // Output UV buffers
        let uvAccessorID: number | undefined = undefined;
        if (fragmesh.uvmaps && fragmesh.uvmaps.length > 0) {
            const uvBufferViewID = bufferViews.length;
            const uvBufferView = this.writeBufferView(Buffer.from(fragmesh.uvmaps[0].uvs.buffer));
            bufferViews.push(uvBufferView);
            uvAccessorID = accessors.length;
            accessors.push({
                bufferView: uvBufferViewID,
                componentType: 5126, // FLOAT
                count: uvBufferView.byteLength / 4 / 2,
                type: 'VEC2'
            });
        }

        mesh.primitives.push({
            attributes: {
                POSITION: positionAccessorID,
            },
            indices: indexAccessorID
        });

        if (!isUndefined(normalAccessorID)) {
            mesh.primitives[0].attributes.NORMAL = normalAccessorID;
        }
        if (!isUndefined(uvAccessorID)) {
            mesh.primitives[0].attributes.TEXCOORD_0 = uvAccessorID;
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

        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];

        // Output index buffer
        const indexBufferViewID = bufferViews.length;
        const indexBufferView = this.writeBufferView(Buffer.from(fragmesh.indices.buffer));
        bufferViews.push(indexBufferView);
        const indexAccessorID = accessors.length;
        accessors.push({
            bufferView: indexBufferViewID,
            componentType: 5123, // UNSIGNED_SHORT
            count: indexBufferView.byteLength / 2,
            type: 'SCALAR'
        });

        // Output vertex buffer
        const positionBufferViewID = bufferViews.length;
        const positionBufferView = this.writeBufferView(Buffer.from(fragmesh.vertices.buffer));
        bufferViews.push(positionBufferView);
        const positionAccessorID = accessors.length;
        accessors.push({
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: positionBufferView.byteLength / 4 / 3,
            type: 'VEC3',
            //min: // TODO
            //max: // TODO
        });

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        if (fragmesh.colors) {
            const colorBufferViewID = bufferViews.length;
            const colorBufferView = this.writeBufferView(Buffer.from(fragmesh.colors.buffer));
            bufferViews.push(colorBufferView);
            colorAccessorID = accessors.length;
            accessors.push({
                bufferView: colorBufferViewID,
                componentType: 5126, // FLOAT
                count: colorBufferView.byteLength / 4 / 3,
                type: 'VEC3',
                //min: // TODO
                //max: // TODO
            });
        }

        mesh.primitives.push({
            mode: 1, // LINES
            attributes: {
                POSITION: positionAccessorID
            },
            indices: indexAccessorID
        });

        if (!isUndefined(colorAccessorID)) {
            mesh.primitives[0].attributes['COLOR_0'] = colorAccessorID;
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

        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const accessors = this.manifest.accessors as gltf.Accessor[];

        // Output vertex buffer
        const positionBufferViewID = bufferViews.length;
        const positionBufferView = this.writeBufferView(Buffer.from(fragmesh.vertices.buffer));
        bufferViews.push(positionBufferView);
        const positionAccessorID = accessors.length;
        accessors.push({
            bufferView: positionBufferViewID,
            componentType: 5126, // FLOAT
            count: positionBufferView.byteLength / 4 / 3,
            type: 'VEC3',
            //min: // TODO
            //max: // TODO
        });

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        if (fragmesh.colors) {
            const colorBufferViewID = bufferViews.length;
            const colorBufferView = this.writeBufferView(Buffer.from(fragmesh.colors.buffer));
            bufferViews.push(colorBufferView);
            colorAccessorID = accessors.length;
            accessors.push({
                bufferView: colorBufferViewID,
                componentType: 5126, // FLOAT
                count: colorBufferView.byteLength / 4 / 3,
                type: 'VEC3',
                //min: // TODO
                //max: // TODO
            });
        }

        mesh.primitives.push({
            mode: 0, // POINTS
            attributes: {
                POSITION: positionAccessorID
            }
        });

        if (!isUndefined(colorAccessorID)) {
            mesh.primitives[0].attributes['COLOR_0'] = colorAccessorID;
        }

        return mesh;
    }

    protected writeBufferView(data: Buffer): gltf.BufferView {
        const hash = this.computeBufferHash(data);
        const cache = this.bufferViewCache.get(hash);
        if (this.deduplicate && cache) {
            this.log(`Skipping a duplicate buffer view (hash: ${hash})`);
            return cache;
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
        this.bufferStream.write(data);
        this.bufferSize += data.byteLength;
        const bufferView = {
            buffer: bufferID,
            byteOffset: buffer.byteLength,
            byteLength: data.byteLength
        };
        buffer.byteLength += bufferView.byteLength;
        if (buffer.byteLength % 4 !== 0) {
            // Pad to 4-byte multiples
            const pad = 4 - buffer.byteLength % 4;
            this.bufferStream.write(new Uint8Array(pad));
            this.bufferSize += pad;
            buffer.byteLength += pad;
        }

        if (this.deduplicate) {
            this.bufferViewCache.set(hash, bufferView);
        }

        return bufferView;
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

    private computeBufferHash(buffer: Buffer): string {
        const hash = crypto.createHash('md5');
        hash.update(buffer);
        return hash.digest('hex');
    }

    private computeMaterialHash(material: IMaterial | null): string {
        if (!material) {
            return 'null';
        }
        const hash = crypto.createHash('md5');
        let tmp = new Float32Array(4);
        tmp.set(material.ambient || [0, 0, 0, 0]);
        hash.update(tmp);
        tmp.set(material.diffuse || [0, 0, 0, 0]);
        hash.update(tmp);
        tmp.set(material.specular || [0, 0, 0, 0]);
        hash.update(tmp);
        tmp.set(material.emissive || [0, 0, 0, 0]);
        hash.update(tmp);
        tmp.set([material.glossiness || 0, material.reflectivity || 0, material.opacity || 0, material.metal ? 1 : 0]);
        if (material.maps) {
            const { diffuse, specular, normal, bump, alpha } = material.maps;
            hash.update(diffuse ? diffuse.uri : '');
            hash.update(specular ? specular.uri : '');
            hash.update(normal ? normal.uri : '');
            hash.update(bump ? bump.uri : '');
            hash.update(alpha ? alpha.uri : '');
        }
        return hash.digest('hex');
    }
}
