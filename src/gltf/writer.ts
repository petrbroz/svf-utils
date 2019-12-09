import * as path from 'path';
import crypto from 'crypto';
import * as fse from 'fs-extra';
import * as pipeline from 'gltf-pipeline';

import * as gltf from './gltf-schema';
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
    skipUnusedUvs?: boolean; /** Skip unused tex coordinates. */
    compress?: boolean; /** Compress output using Draco. */
    binary?: boolean; /** Output GLB instead of GLTF. */
    center?: boolean; /** Move the model to origin. */
    log?: (msg: string) => void; /** Optional logging function. */
}

function hasTextures(material: IMaterial | null): boolean {
    return !!material && !!material.maps && (!!material.maps.diffuse || !!material.maps.specular);
}

interface IWriterStats {
    materialsDeduplicated: number;
    meshesDeduplicated: number;
    accessorsDeduplicated: number;
    bufferViewsDeduplicated: number;
}

/**
 * Utility class for serializing SVF content to local file system as glTF (2.0).
 */
export class Writer {
    protected options: Required<IWriterOptions>;

    protected baseDir: string;
    protected manifest: gltf.GlTf;
    protected bufferStream: fse.WriteStream | null;
    protected bufferSize: number;
    protected bufferViewCache = new Map<string, gltf.BufferView>(); // Cache of existing buffer views, indexed by hash of the binary data they point to
    protected meshHashes: string[] = []; // List of hashes of existing gltf.Mesh objects, used for deduplication
    protected bufferViewHashes: string[] = []; // List of hashes of existing gltf.BufferView objects, used for deduplication
    protected accessorHashes: string[] = []; // List of hashes of existing gltf.Accessor objects, used for deduplication
    protected pendingTasks: Promise<void>[] = [];
    protected stats: IWriterStats = {
        materialsDeduplicated: 0,
        meshesDeduplicated: 0,
        accessorsDeduplicated: 0,
        bufferViewsDeduplicated: 0
    };

    /**
     * Initializes the writer.
     * @param {IWriterOptions} [options={}] Additional writer options.
     */
    constructor(options: IWriterOptions = {}) {
        this.options = {
            maxBufferSize: isNullOrUndefined(options.maxBufferSize) ? MaxBufferSize : options.maxBufferSize,
            ignoreMeshGeometry: !!options.ignoreMeshGeometry,
            ignoreLineGeometry: !!options.ignoreLineGeometry,
            ignorePointGeometry: !!options.ignorePointGeometry,
            deduplicate: !!options.deduplicate,
            skipUnusedUvs: !!options.skipUnusedUvs,
            compress: !!options.compress,
            binary: !!options.binary,
            center: !!options.center,
            log: (options && options.log) || function (msg: string) {}
        };

        // All these properties will be properly initialized in the 'reset' call
        this.manifest = {} as gltf.GlTf;
        this.bufferStream = null;
        this.bufferSize = 0;
        this.baseDir = '';
    }

    /**
     * Outputs entire SVF scene into glTF or glb.
     * @async
     * @param {ISvfContent} svf SVF content loaded in memory.
     * @param {string} outputDir Path to output folder.
     */
    async write(svf: ISvfContent, outputDir: string) {
        this.reset(outputDir);
        const scene = this.createScene(svf);
        const scenes = this.manifest.scenes as gltf.Scene[];
        scenes.push(scene);

        if (this.bufferStream) {
            const stream = this.bufferStream as fse.WriteStream;
            this.pendingTasks.push(new Promise((resolve, reject) => {
                stream.on('finish', resolve);
            }));
            this.bufferStream.close();
            this.bufferStream = null;
            this.bufferSize = 0;
        }

        await Promise.all(this.pendingTasks);
        const gltfPath = path.join(this.baseDir, 'output.gltf');
        fse.writeFileSync(gltfPath, JSON.stringify(this.manifest, null, 4));
        this.options.log(`Closing gltf output: done`);
        this.options.log(`Stats: ${JSON.stringify(this.stats)}`);
        await this.postprocess(svf, gltfPath);
    }

    protected reset(outputDir: string) {
        this.baseDir = (this.options.compress || this.options.binary) ? path.join(outputDir, 'tmp') : outputDir;
        this.manifest = {
            asset: {
                version: '2.0',
                generator: 'forge-convert-utils',
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
            scene: 0
        };
        this.bufferStream = null;
        this.bufferSize = 0;
        this.bufferViewCache.clear();
        this.meshHashes = [];
        this.bufferViewHashes = [];
        this.accessorHashes = [];
        this.pendingTasks = [];
        this.stats = {
            materialsDeduplicated: 0,
            meshesDeduplicated: 0,
            accessorsDeduplicated: 0,
            bufferViewsDeduplicated: 0
        };
    }

    protected async postprocess(svf: ISvfContent, gltfPath: string) {
        if (this.options.compress || this.options.binary) {
            this.options.log(`Post-processing gltf output...`);
            const options: any = {
                resourceDirectory: this.baseDir,
                separate: !this.options.binary,
                stats: true,
                name: 'output'
            };
            if (this.options.compress) {
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
            const outputFolder = this.baseDir.replace(/tmp$/, '');
            try {
                if (this.options.binary) {
                    const result = await pipeline.gltfToGlb(manifest, options);
                    fse.writeFileSync(path.join(outputFolder, 'output.glb'), result.glb);
                } else {
                    const result = await pipeline.processGltf(manifest, options);
                    fse.writeJsonSync(path.join(outputFolder, 'output.gltf'), result.gltf);
                    for (const name of Object.getOwnPropertyNames(result.separateResources)) {
                        const filePath = path.join(outputFolder, name);
                        fse.ensureDirSync(path.dirname(filePath));
                        fse.writeFileSync(filePath, result.separateResources[name]);
                    }
                }
                fse.removeSync(this.baseDir);
            } catch(err) {
                console.error('Could not post-process the output', err);
            }
            this.options.log(`Post-processing gltf output: done`);
        }
    }

    protected createScene(svf: ISvfContent): gltf.Scene {
        fse.ensureDirSync(this.baseDir);

        let scene: gltf.Scene = {
            nodes: []
        };
        const manifestNodes = this.manifest.nodes as gltf.Node[];
        const manifestMaterials = this.manifest.materials as gltf.MaterialPbrMetallicRoughness[];
        const rootNode: gltf.Node = { children: [] }; // Root node with transform to glTF coordinate system
        const xformNode: gltf.Node = { children: [] }; // Transform node with additional global transform (e.g., moving model to origin)
        (scene.nodes as number[]).push(manifestNodes.push(rootNode) - 1);
        (rootNode.children as number[]).push(manifestNodes.push(xformNode) - 1);

        // Setup transformation to glTF coordinate system
        const { metadata } = svf.metadata;
        if (metadata['world up vector'] && metadata['world front vector']) {
            const svfUp = metadata['world up vector'].XYZ;
            const svfFront = metadata['world front vector'].XYZ;
            if (svfUp && svfFront) {
                const svfLeft = [
                    svfUp[1] * svfFront[2] - svfUp[2] * svfFront[1],
                    svfUp[2] * svfFront[0] - svfUp[0] * svfFront[2],
                    svfUp[0] * svfFront[1] - svfUp[1] * svfFront[0]
                ];
                rootNode.matrix = [
                    svfLeft[0], svfUp[0], svfFront[0], 0,
                    svfLeft[1], svfUp[1], svfFront[1], 0,
                    svfLeft[2], svfUp[2], svfFront[2], 0,
                    0, 0, 0, 1
                ];
            }
        }
        // Setup translation to origin when enabled
        if (metadata['world bounding box'] && this.options.center) {
            const svfBoundsMin = metadata['world bounding box'].minXYZ;
            const svfBoundsMax = metadata['world bounding box'].maxXYZ;
            if (svfBoundsMin && svfBoundsMax) {
                let translation = [
                    -0.5 * (svfBoundsMin[0] + svfBoundsMax[0]),
                    -0.5 * (svfBoundsMin[1] + svfBoundsMax[1]),
                    -0.5 * (svfBoundsMin[2] + svfBoundsMax[2])
                ];
                xformNode.matrix = [
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    translation[0], translation[1], translation[2], 1
                ];
            }
        }

        const nodeIndices = (xformNode.children as number[]);
        this.options.log(`Writing scene nodes...`);
        for (const fragment of svf.fragments) {
            const material = svf.materials[fragment.materialID];
            // Only output UVs if there are any textures or if the user specifically asked not to skip unused UVs
            const outputUvs = hasTextures(material) || !this.options.skipUnusedUvs;
            const node = this.createNode(fragment, svf, outputUvs);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                nodeIndices.push(manifestNodes.push(node) - 1);
            }
        }

        this.options.log(`Writing materials...`);
        if (this.options.deduplicate) {
            const hashes: string[] = [];
            const newMaterialIndices = new Uint16Array(svf.materials.length);
            for (let i = 0, len = svf.materials.length; i < len; i++) {
                const material = svf.materials[i];
                const hash = this.computeMaterialHash(material);
                const match = hashes.indexOf(hash);
                if (match === -1) {
                    // If this is a first occurrence of the hash in the array, output a new material
                    newMaterialIndices[i] = manifestMaterials.length;
                    manifestMaterials.push(this.createMaterial(material, svf));
                    hashes.push(hash);
                } else {
                    // Otherwise skip the material, and record an index to the first match below
                    this.options.log(`Skipping a duplicate material (hash: ${hash})`);
                    newMaterialIndices[i] = match;
                    this.stats.materialsDeduplicated++;
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
                const mat = this.createMaterial(material, svf);
                manifestMaterials.push(mat);
            }
        }

        this.options.log(`Writing scene: done`);
        return scene;
    }

    protected createNode(fragment: IFragment, svf: ISvfContent, outputUvs: boolean): gltf.Node {
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
        if (fragmesh) {
            let mesh: gltf.Mesh;
            if ('isLines' in fragmesh) {
                mesh = this.createLineGeometry(fragmesh, svf);
            } else if ('isPoints' in fragmesh) {
                mesh = this.createPointGeometry(fragmesh, svf);
            } else {
                mesh = this.createMeshGeometry(fragmesh, svf, outputUvs);
            }
            for (const primitive of mesh.primitives) {
                primitive.material = fragment.materialID;
            }
            node.mesh = this.addMesh(mesh);
        } else {
            console.warn('Could not find mesh for fragment', fragment, 'geometry', geometry);
        }
        return node;
    }

    protected addMesh(mesh: gltf.Mesh): number {
        const meshes = this.manifest.meshes as gltf.Mesh[];
        const hash = this.computeMeshHash(mesh);
        const match = this.options.deduplicate ? this.meshHashes.indexOf(hash) : -1;
        if (match !== -1) {
            this.options.log(`Skipping a duplicate mesh (${hash})`);
            this.stats.meshesDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.meshHashes.push(hash);
            }
            return meshes.push(mesh) - 1;
        }
    }

    protected createMeshGeometry(fragmesh: IMesh, svf: ISvfContent, outputUvs: boolean): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignoreMeshGeometry) {
            return mesh;
        }

        // Output index buffer
        const indexBufferView = this.createBufferView(Buffer.from(fragmesh.indices.buffer));
        const indexBufferViewID = this.addBufferView(indexBufferView);
        const indexAccessor = this.createAccessor(indexBufferViewID, 5123, indexBufferView.byteLength / 2, 'SCALAR');
        const indexAccessorID = this.addAccessor(indexAccessor);

        // Output vertex buffer
        const positionBounds = this.computeBoundsVec3(fragmesh.vertices); // Compute bounds manually, just in case
        const positionBufferView = this.createBufferView(Buffer.from(fragmesh.vertices.buffer));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max/*[fragmesh.min.x, fragmesh.min.y, fragmesh.min.z], [fragmesh.max.x, fragmesh.max.y, fragmesh.max.z]*/);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output normals buffer
        let normalAccessorID: number | undefined = undefined;
        if (fragmesh.normals) {
            const normalBufferView = this.createBufferView(Buffer.from(fragmesh.normals.buffer));
            const normalBufferViewID = this.addBufferView(normalBufferView);
            const normalAccessor = this.createAccessor(normalBufferViewID, 5126, normalBufferView.byteLength / 4 / 3, 'VEC3');
            normalAccessorID = this.addAccessor(normalAccessor);
        }

        // Output UV buffers
        let uvAccessorID: number | undefined = undefined;
        if (fragmesh.uvmaps && fragmesh.uvmaps.length > 0 && outputUvs) {
            const uvBufferView = this.createBufferView(Buffer.from(fragmesh.uvmaps[0].uvs.buffer));
            const uvBufferViewID = this.addBufferView(uvBufferView);
            const uvAccessor = this.createAccessor(uvBufferViewID, 5126, uvBufferView.byteLength / 4 / 2, 'VEC2');
            uvAccessorID = this.addAccessor(uvAccessor);
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

    protected createLineGeometry(fragmesh: ILines, svf: ISvfContent): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignoreLineGeometry) {
            return mesh;
        }

        // Output index buffer
        const indexBufferView = this.createBufferView(Buffer.from(fragmesh.indices.buffer));
        const indexBufferViewID = this.addBufferView(indexBufferView);
        const indexAccessor = this.createAccessor(indexBufferViewID, 5123, indexBufferView.byteLength / 2, 'SCALAR');
        const indexAccessorID = this.addAccessor(indexAccessor);

        // Output vertex buffer
        const positionBounds = this.computeBoundsVec3(fragmesh.vertices);
        const positionBufferView = this.createBufferView(Buffer.from(fragmesh.vertices.buffer));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        if (fragmesh.colors) {
            const colorBufferView = this.createBufferView(Buffer.from(fragmesh.colors.buffer));
            const colorBufferViewID = this.addBufferView(colorBufferView);
            const colorAccessor = this.createAccessor(colorBufferViewID, 5126, colorBufferView.byteLength / 4 / 3, 'VEC3');
            colorAccessorID = this.addAccessor(colorAccessor);
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

    protected createPointGeometry(fragmesh: IPoints, svf: ISvfContent): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignorePointGeometry) {
            return mesh;
        }

        // Output vertex buffer
        const positionBounds = this.computeBoundsVec3(fragmesh.vertices);
        const positionBufferView = this.createBufferView(Buffer.from(fragmesh.vertices.buffer));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        if (fragmesh.colors) {
            const colorBufferView = this.createBufferView(Buffer.from(fragmesh.colors.buffer));
            const colorBufferViewID = this.addBufferView(colorBufferView);
            const colorAccessor = this.createAccessor(colorBufferViewID, 5126, colorBufferView.byteLength / 4 / 3, 'VEC3');
            colorAccessorID = this.addAccessor(colorAccessor);
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

    protected addBufferView(bufferView: gltf.BufferView): number {
        const bufferViews = this.manifest.bufferViews as gltf.BufferView[];
        const hash = this.computeBufferViewHash(bufferView);
        const match = this.options.deduplicate ? this.bufferViewHashes.indexOf(hash) : -1;
        if (match !== -1) {
            this.options.log(`Skipping a duplicate buffer view (${hash})`);
            this.stats.bufferViewsDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.bufferViewHashes.push(hash);
            }
            return bufferViews.push(bufferView) - 1;
        }
    }

    protected createBufferView(data: Buffer): gltf.BufferView {
        const hash = this.computeBufferHash(data);
        const cache = this.bufferViewCache.get(hash);
        if (this.options.deduplicate && cache) {
            this.options.log(`Skipping a duplicate buffer (${hash})`);
            return cache;
        }

        const manifestBuffers = this.manifest.buffers as gltf.Buffer[];

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > this.options.maxBufferSize) {
            if (this.bufferStream) {
                const stream = this.bufferStream as fse.WriteStream;
                this.pendingTasks.push(new Promise((resolve, reject) => {
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

        if (this.options.deduplicate) {
            this.bufferViewCache.set(hash, bufferView);
        }

        return bufferView;
    }

    protected addAccessor(accessor: gltf.Accessor): number {
        const accessors = this.manifest.accessors as gltf.Accessor[];
        const hash = this.computeAccessorHash(accessor);
        const match = this.options.deduplicate ? this.accessorHashes.indexOf(hash) : -1;
        if (match !== -1) {
            this.options.log(`Skipping a duplicate accessor (${hash})`);
            this.stats.accessorsDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.accessorHashes.push(hash);
            }
            return accessors.push(accessor) - 1;
        }
    }

    protected createAccessor(bufferViewID: number, componentType: number, count: number, type: string, min?: number[], max?: number[]): gltf.Accessor {
        const accessor: gltf.Accessor = {
            bufferView: bufferViewID,
            componentType: componentType,
            count: count,
            type: type
        };

        if (!isUndefined(min)) {
            accessor.min = min.map(Math.fround);
        }
        if (!isUndefined(max)) {
            accessor.max = max.map(Math.fround);
        }

        return accessor;
    }

    protected createMaterial(mat: IMaterial | null, svf: ISvfContent): gltf.MaterialPbrMetallicRoughness {
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
                manifestTextures.push(this.createTexture(mat.maps.diffuse, svf));
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: textureID,
                    texCoord: 0
                };
            }
        }
        return material;
    }

    protected createTexture(map: IMaterialMap, svf: ISvfContent): gltf.Texture {
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

    protected computeMeshHash(mesh: gltf.Mesh): string {
        return mesh.primitives.map(p => {
            return `${p.mode || ''}/${p.material || ''}/${p.indices}/${p.attributes['POSITION'] || ''}/${p.attributes['NORMAL'] || ''}/${p.attributes['TEXCOORD_0'] || ''}/${p.attributes['COLOR_0'] || ''}`;
        }).join('/');
    }

    protected computeBufferViewHash(bufferView: gltf.BufferView): string {
        return `${bufferView.buffer}/${bufferView.byteLength}/${bufferView.byteOffset || ''}/${bufferView.byteStride || ''}`;
    }

    protected computeAccessorHash(accessor: gltf.Accessor): string {
        return `${accessor.type}/${accessor.componentType}/${accessor.count}/${accessor.bufferView || 'X'}`;
    }

    protected computeBufferHash(buffer: Buffer): string {
        const hash = crypto.createHash('md5');
        hash.update(buffer);
        return hash.digest('hex');
    }

    protected computeMaterialHash(material: IMaterial | null): string {
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

    protected computeBoundsVec3(array: Float32Array): { min: number[], max: number[] } {
        const min = [array[0], array[1], array[2]];
        const max = [array[0], array[1], array[2]];
        for (let i = 0; i < array.length; i += 3) {
            min[0] = Math.min(min[0], array[i]); max[0] = Math.max(max[0], array[i]);
            min[1] = Math.min(min[1], array[i + 1]); max[1] = Math.max(max[1], array[i + 1]);
            min[2] = Math.min(min[2], array[i + 2]); max[2] = Math.max(max[2], array[i + 2]);
        }
        return { min, max };
    }
}
