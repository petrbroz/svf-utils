import * as path from 'path';
import crypto from 'crypto';
import * as fse from 'fs-extra';

import * as gltf from './schema';
import { isUndefined, isNullOrUndefined } from 'util';
import { ImagePlaceholder } from '../common/image-placeholders';
import * as IMF from '../common/intermediate-format';

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
    center?: boolean; /** Move the model to origin. */
    log?: (msg: string) => void; /** Optional logging function. */
    filter?: (dbid: number, fragid: number) => boolean;
}

function hasTextures(material: IMF.Material | null): boolean {
    return !!(material?.maps?.diffuse);
}

interface IWriterStats {
    materialsDeduplicated: number;
    meshesDeduplicated: number;
    accessorsDeduplicated: number;
    bufferViewsDeduplicated: number;
}

/**
 * Utility class for serializing parsed 3D content to local file system as glTF (2.0).
 */
export class Writer {
    protected options: Required<IWriterOptions>;

    protected baseDir: string;
    protected manifest: gltf.GlTf;
    protected bufferStream: fse.WriteStream | null;
    protected bufferSize: number;
    protected bufferViewCache = new Map<string, gltf.BufferView>(); // Cache of existing buffer views, indexed by hash of the binary data they point to
    protected meshHashes = new Map<string, number>(); // List of hashes of existing gltf.Mesh objects, used for deduplication
    protected bufferViewHashes = new Map<string, number>(); // List of hashes of existing gltf.BufferView objects, used for deduplication
    protected accessorHashes = new Map<string, number>(); // List of hashes of existing gltf.Accessor objects, used for deduplication
    protected pendingTasks: Promise<void>[] = [];
    protected activeSvfMaterials: number[]; // List of SVF material IDs that are actually used during the glTF serialization (used to avoid serializing unused materials)
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
            center: !!options.center,
            log: (options && options.log) || function (msg: string) {},
            filter: options && options.filter || ((dbid: number, fragid: number) => true)
        };

        // All these properties will be properly initialized in the 'reset' call
        this.manifest = {} as gltf.GlTf;
        this.bufferStream = null;
        this.bufferSize = 0;
        this.baseDir = '';
        this.activeSvfMaterials = [];
    }

    /**
     * Outputs scene into glTF.
     * @async
     * @param {IMF.IScene} imf Complete scene in intermediate, in-memory format.
     * @param {string} outputDir Path to output folder.
     */
    async write(imf: IMF.IScene, outputDir: string) {
        this.reset(outputDir);
        const scene = this.createScene(imf);
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

        // Remove empty attributes textures or images to avoid errors in glTF validation
        if (this.manifest.textures && this.manifest.textures.length === 0)
            delete this.manifest.textures;
        if (this.manifest.images && this.manifest.images.length === 0)
            delete this.manifest.images;

        const gltfPath = path.join(this.baseDir, 'output.gltf');
        this.serializeManifest(this.manifest, gltfPath);
        this.options.log(`Closing gltf output: done`);
        this.options.log(`Stats: ${JSON.stringify(this.stats)}`);
        await this.postprocess(imf, gltfPath);
    }

    protected reset(outputDir: string) {
        this.baseDir = outputDir;
        this.manifest = {
            asset: {
                version: '2.0',
                generator: 'forge-convert-utils',
                copyright: '2019 (c) Autodesk'
            },
            extensionsUsed: [
                "KHR_texture_transform"
            ],
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
        this.meshHashes = new Map<string, number>();
        this.bufferViewHashes = new Map<string, number>();
        this.accessorHashes = new Map<string, number>();
        this.pendingTasks = [];
        this.activeSvfMaterials = [];
        this.stats = {
            materialsDeduplicated: 0,
            meshesDeduplicated: 0,
            accessorsDeduplicated: 0,
            bufferViewsDeduplicated: 0
        };
    }

    protected async postprocess(imf: IMF.IScene, gltfPath: string) {}

    protected serializeManifest(manifest: gltf.GlTf, outputPath: string) {
        fse.writeFileSync(outputPath, JSON.stringify(manifest, null, 4));
    }

    protected createScene(imf: IMF.IScene): gltf.Scene {
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
        const metadata = imf.getMetadata();
        if (metadata['world up vector'] && metadata['world front vector'] && metadata['distance unit']) {
            const up = metadata['world up vector'].XYZ;
            const front = metadata['world front vector'].XYZ;
            const distanceUnit = metadata['distance unit'].value;
            if (up && front && distanceUnit) {
                const left = [
                    up[1] * front[2] - up[2] * front[1],
                    up[2] * front[0] - up[0] * front[2],
                    up[0] * front[1] - up[1] * front[0]
                ];

                if (left[0] * left[0] + left[1] * left[1] + left[2] * left[2] > 0.0) {
                    let scale = 1.0;
                    switch (distanceUnit) {
                        case 'centimeter':
                        case 'cm':
                            scale = 0.01;
                            break;
                        case 'millimeter':
                        case 'mm':
                            scale = 0.001;
                            break;
                        case 'foot':
                        case 'ft':
                            scale = 0.3048;
                            break;
                        case 'inch':
                        case 'in':
                            scale = 0.0254;
                            break;
                        default:    // "meter" / "m"
                            scale = 1.0;
                    }

                    rootNode.matrix = [
                        left[0] * scale, up[0] * scale, front[0] * scale, 0,
                        left[1] * scale, up[1] * scale, front[1] * scale, 0,
                        left[2] * scale, up[2] * scale, front[2] * scale, 0,
                        0, 0, 0, 1
                    ];
                } else {
                    console.warn('Could not compute world matrix, leaving it as identity...');
                }
            }
        }
        // Setup translation to origin when enabled
        if (metadata['world bounding box'] && this.options.center) {
            const boundsMin = metadata['world bounding box'].minXYZ;
            const boundsMax = metadata['world bounding box'].maxXYZ;
            if (boundsMin && boundsMax) {
                let translation = [
                    -0.5 * (boundsMin[0] + boundsMax[0]),
                    -0.5 * (boundsMin[1] + boundsMax[1]),
                    -0.5 * (boundsMin[2] + boundsMax[2])
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
        const { filter } = this.options;
        for (let i = 0, len = imf.getNodeCount(); i < len; i++) {
            const fragment = imf.getNode(i);
            // Currently we only support flat lists of objects, no hierarchies
            if (fragment.kind !== IMF.NodeKind.Object) {
                continue;
            }
            if (!filter(fragment.dbid, i)) {
                continue;
            }
            const material = imf.getMaterial(fragment.material);
            // Only output UVs if there are any textures or if the user specifically asked not to skip unused UVs
            const outputUvs = hasTextures(material) || !this.options.skipUnusedUvs;
            const node = this.createNode(fragment, imf, outputUvs);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                nodeIndices.push(manifestNodes.push(node) - 1);
            }
        }

        this.options.log(`Writing materials...`);
        if (this.options.deduplicate) {
            const hashes: string[] = [];
            const newMaterialIndices = new Uint16Array(imf.getMaterialCount());
            for (const [i, activeMaterialID] of this.activeSvfMaterials.entries()) {
                const material = imf.getMaterial(activeMaterialID);
                const hash = this.computeMaterialHash(material);
                const match = hashes.indexOf(hash);
                if (match === -1) {
                    // If this is a first occurrence of the hash in the array, output a new material
                    newMaterialIndices[i] = manifestMaterials.length;
                    manifestMaterials.push(this.createMaterial(material, imf));
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
            for (const activeMaterialID of this.activeSvfMaterials) {
                const material = imf.getMaterial(activeMaterialID);
                const mat = this.createMaterial(material, imf);
                manifestMaterials.push(mat);
            }
        }

        this.options.log(`Writing scene: done`);
        return scene;
    }

    protected createNode(fragment: IMF.IObjectNode, imf: IMF.IScene, outputUvs: boolean): gltf.Node {
        let node: gltf.Node = {
            name: fragment.dbid.toString()
        };

        if (fragment.transform) {
            switch (fragment.transform.kind) {
                case IMF.TransformKind.Matrix:
                    node.matrix = fragment.transform.elements;
                    break;
                case IMF.TransformKind.Decomposed:
                    if (fragment.transform.scale) {
                        const s = fragment.transform.scale;
                        node.scale = [s.x, s.y, s.z];
                    }
                    if (fragment.transform.rotation) {
                        const r = fragment.transform.rotation;
                        node.rotation = [r.x, r.y, r.z, r.w];
                    }
                    if (fragment.transform.translation) {
                        const t = fragment.transform.translation;
                        node.translation = [t.x, t.y, t.z];
                    }
                    break;
            }
        }

        const geometry = imf.getGeometry(fragment.geometry);
        let mesh: gltf.Mesh | undefined = undefined;
        switch (geometry.kind) {
            case IMF.GeometryKind.Mesh:
                mesh = this.createMeshGeometry(geometry, imf, outputUvs);
                break;
            case IMF.GeometryKind.Lines:
                mesh = this.createLineGeometry(geometry, imf);
                break;
            case IMF.GeometryKind.Points:
                mesh = this.createPointGeometry(geometry, imf);
                break;
            case IMF.GeometryKind.Empty:
                console.warn('Could not find mesh for fragment', fragment);
                break;
        }
        if (mesh && mesh.primitives.length > 0) {
            let materialID = this.activeSvfMaterials.indexOf(fragment.material);
            if (materialID === -1) {
                materialID = this.activeSvfMaterials.length;
                this.activeSvfMaterials.push(fragment.material);
            }
            for (const primitive of mesh.primitives) {
                primitive.material = materialID;
            }
            node.mesh = this.addMesh(mesh);
        }
        return node;
    }

    protected addMesh(mesh: gltf.Mesh): number {
        const meshes = this.manifest.meshes as gltf.Mesh[];
        const hash = this.computeMeshHash(mesh);
        const match = this.options.deduplicate ? this.meshHashes.get(hash) : undefined;
        if (match !== undefined) {
            this.options.log(`Skipping a duplicate mesh (${hash})`);
            this.stats.meshesDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.meshHashes.set(hash, this.meshHashes.size);
            }
            return meshes.push(mesh) - 1;
        }
    }

    protected createMeshGeometry(geometry: IMF.IMeshGeometry, imf: IMF.IScene, outputUvs: boolean): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignoreMeshGeometry) {
            return mesh;
        }

        // Output index buffer
        const indices = geometry.getIndices();
        const indexBufferView = this.createBufferView(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
        const indexBufferViewID = this.addBufferView(indexBufferView);
        const indexAccessor = this.createAccessor(indexBufferViewID, 5123, indexBufferView.byteLength / 2, 'SCALAR');
        const indexAccessorID = this.addAccessor(indexAccessor);

        // Output vertex buffer
        const vertices = geometry.getVertices();
        const positionBounds = this.computeBoundsVec3(vertices); // Compute bounds manually, just in case
        const positionBufferView = this.createBufferView(Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max/*[fragmesh.min.x, fragmesh.min.y, fragmesh.min.z], [fragmesh.max.x, fragmesh.max.y, fragmesh.max.z]*/);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output normals buffer
        let normalAccessorID: number | undefined = undefined;
        const normals = geometry.getNormals();
        if (normals) {
            const normalBufferView = this.createBufferView(Buffer.from(normals.buffer, normals.byteOffset, normals.byteLength));
            const normalBufferViewID = this.addBufferView(normalBufferView);
            const normalAccessor = this.createAccessor(normalBufferViewID, 5126, normalBufferView.byteLength / 4 / 3, 'VEC3');
            normalAccessorID = this.addAccessor(normalAccessor);
        }

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        const colors = geometry.getColors();
        if (colors) {
            const colorBufferView = this.createBufferView(Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength));
            const colorBufferViewID = this.addBufferView(colorBufferView);
            const colorAccessor = this.createAccessor(colorBufferViewID, 5126, colorBufferView.byteLength / 4 / 4, 'VEC4');
            colorAccessorID = this.addAccessor(colorAccessor);
        }

        // Output UV buffers
        let uvAccessorID: number | undefined = undefined;
        if (geometry.getUvChannelCount() > 0 && outputUvs) {
            const uvs = geometry.getUvs(0);
            const uvBufferView = this.createBufferView(Buffer.from(uvs.buffer, uvs.byteOffset, uvs.byteLength));
            const uvBufferViewID = this.addBufferView(uvBufferView);
            const uvAccessor = this.createAccessor(uvBufferViewID, 5126, uvBufferView.byteLength / 4 / 2, 'VEC2');
            uvAccessorID = this.addAccessor(uvAccessor);
        }

        mesh.primitives.push({
            mode: 4,
            attributes: {
                POSITION: positionAccessorID,
            },
            indices: indexAccessorID
        });

        if (!isUndefined(normalAccessorID)) {
            mesh.primitives[0].attributes.NORMAL = normalAccessorID;
        }
        if (!isUndefined(colorAccessorID)) {
            mesh.primitives[0].attributes.COLOR_0 = colorAccessorID;
        }
        if (!isUndefined(uvAccessorID)) {
            mesh.primitives[0].attributes.TEXCOORD_0 = uvAccessorID;
        }

        return mesh;
    }

    protected createLineGeometry(geometry: IMF.ILineGeometry, imf: IMF.IScene): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignoreLineGeometry) {
            return mesh;
        }

        // Output index buffer
        const indices = geometry.getIndices();
        const indexBufferView = this.createBufferView(Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
        const indexBufferViewID = this.addBufferView(indexBufferView);
        const indexAccessor = this.createAccessor(indexBufferViewID, 5123, indexBufferView.byteLength / 2, 'SCALAR');
        const indexAccessorID = this.addAccessor(indexAccessor);

        // Output vertex buffer
        const vertices = geometry.getVertices();
        const positionBounds = this.computeBoundsVec3(vertices);
        const positionBufferView = this.createBufferView(Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        const colors = geometry.getColors();
        if (colors) {
            const colorBufferView = this.createBufferView(Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength));
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

    protected createPointGeometry(geometry: IMF.IPointGeometry, imf: IMF.IScene): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        if (this.options.ignorePointGeometry) {
            return mesh;
        }

        // Output vertex buffer
        const vertices = geometry.getVertices();
        const positionBounds = this.computeBoundsVec3(vertices);
        const positionBufferView = this.createBufferView(Buffer.from(vertices.buffer, vertices.byteOffset, vertices.byteLength));
        const positionBufferViewID = this.addBufferView(positionBufferView);
        const positionAccessor = this.createAccessor(positionBufferViewID, 5126, positionBufferView.byteLength / 4 / 3, 'VEC3', positionBounds.min, positionBounds.max);
        const positionAccessorID = this.addAccessor(positionAccessor);

        // Output color buffer
        let colorAccessorID: number | undefined = undefined;
        const colors = geometry.getColors();
        if (colors) {
            const colorBufferView = this.createBufferView(Buffer.from(colors.buffer, colors.byteOffset, colors.byteLength));
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
        const match = this.options.deduplicate ? this.bufferViewHashes.get(hash) : undefined;
        if (match !== undefined) {
            this.options.log(`Skipping a duplicate buffer view (${hash})`);
            this.stats.bufferViewsDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.bufferViewHashes.set(hash, this.bufferViewHashes.size);
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
        const match = this.options.deduplicate ? this.accessorHashes.get(hash) : undefined;
        if (match !== undefined) {
            this.options.log(`Skipping a duplicate accessor (${hash})`);
            this.stats.accessorsDeduplicated++;
            return match;
        } else {
            if (this.options.deduplicate) {
                this.accessorHashes.set(hash, this.accessorHashes.size);
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

    protected createMaterial(mat: IMF.Material | null, imf: IMF.IScene): gltf.MaterialPbrMetallicRoughness {
        // console.log('writing material', mat)
        if (!mat) {
            return DefaultMaterial;
        }

        const diffuse = mat.diffuse;
        let material: gltf.MaterialPbrMetallicRoughness = {
            pbrMetallicRoughness: {
                baseColorFactor: [diffuse.x, diffuse.y, diffuse.z, 1.0],
                metallicFactor: mat.metallic,
                roughnessFactor: (mat.roughness > 1.0) ? 1.0 : mat.roughness
            }
        };
        if (!isUndefined(mat.opacity) && mat.opacity < 1.0 && material.pbrMetallicRoughness.baseColorFactor) {
            material.alphaMode = 'BLEND';
            material.pbrMetallicRoughness.baseColorFactor[3] = mat.opacity;
        }

        if (mat.maps) {
            const manifestTextures = this.manifest.textures as gltf.Texture[];
            if (mat.maps.diffuse) {
                const textureID = manifestTextures.length;
                manifestTextures.push(this.createTexture(mat.maps.diffuse, imf));
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: textureID,
                    texCoord: 0,
                    extensions: {
                        "KHR_texture_transform": {
                            scale: [mat.scale?.x, mat.scale?.y]
                        }
                    }
                };
            }
        }
        return material;
    }

    protected createTexture(uri: string, imf: IMF.IScene): gltf.Texture {
        const manifestImages = this.manifest.images as gltf.Image[];
        let imageID = manifestImages.findIndex(image => image.uri === uri);
        if (imageID === -1) {
            imageID = manifestImages.length;
            const normalizedUri = uri.toLowerCase().split(/[\/\\]/).join(path.sep);
            manifestImages.push({ uri: normalizedUri });
            const filePath = path.join(this.baseDir, normalizedUri);
            fse.ensureDirSync(path.dirname(filePath));
            let imageData = imf.getImage(normalizedUri);
            if (!imageData) {
                // Default to a placeholder image based on the extension
                switch (normalizedUri.substr(normalizedUri.lastIndexOf('.'))) {
                    case '.jpg':
                    case '.jpeg':
                        imageData = ImagePlaceholder.JPG;
                        break;
                    case '.png':
                        imageData = ImagePlaceholder.PNG;
                        break;
                    case '.bmp':
                        imageData = ImagePlaceholder.BMP;
                        break;
                    case '.gif':
                        imageData = ImagePlaceholder.GIF;
                        break;
                    default:
                        throw new Error(`Unsupported image format for ${normalizedUri}`);
                }
            }
            fse.writeFileSync(filePath, imageData);
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

    protected computeMaterialHash(material: IMF.IPhysicalMaterial | null): string {
        if (!material) {
            return 'null';
        }
        const hash = crypto.createHash('md5');
        hash.update(JSON.stringify(material)); // TODO
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
