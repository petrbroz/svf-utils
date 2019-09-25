import * as path from 'path';
import * as fse from 'fs-extra';

import { ISvf } from './svf';
import { IFragment, IMaterial, IMesh, IMaterialMap } from 'forge-server-utils/dist/svf';
import { isUndefined } from 'util';

const BufferSizeLimit = 5 << 20;

export interface IGltfScene {
    name: string;
    nodes: IGltfNode[];
}

export interface IGltfNode {
    name: string;
    mesh?: number;
    translation?: number[];
    scale?: number[];
    rotation?: number[];
    matrix?: number[];
}

export interface IGltfMesh {
    primitives: any[];
}

export interface IGltfMaterial {
    name?: string;
    pbrMetallicRoughness: {
        baseColorFactor?: number[];
        baseColorTexture?: {
            index: number;
            texCoord: number;
        };
        metallicFactor?: number;
        metallicRoughnessTexture?: {
            index: number;
            texCoord: number;
        };
        roughnessFactor?: number;
    };
    normalTexture?: {
        scale: number;
        index: number;
        texCoord: number;
    };
    alphaMode?: string;
}

export interface IGltfTexture {
    source?: number;
}

export interface IGltfImage {
    uri?: string;
}

const DefaultMaterial: IGltfMaterial = {
    pbrMetallicRoughness: {
        baseColorFactor: [0.25, 0.25, 0.25, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.5
    }
};

export class GltfSerializer {
    protected manifest: any;

    protected downloads: Promise<string>[] = [];
    protected bufferStream: fse.WriteStream | null;
    protected bufferSize: number;

    constructor(protected baseDir: string) {
        this.bufferStream = null;
        this.bufferSize = 0;
        this.manifest = {
            asset: {
                version: '2.0',
                generator: 'forge-extract',
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
            scene: -1
        };
    }

    async serialize(svf: ISvf) {
        this.manifest.scenes.push(this.serializeScene(svf));
        this.manifest.scene = 0;
        const gltfPath = path.join(this.baseDir, 'output.gltf');
        fse.writeFileSync(gltfPath, JSON.stringify(this.manifest, null, 4));
        await Promise.all(this.downloads);
    }

    protected serializeScene(svf: ISvf): IGltfScene {
        let scene: IGltfScene = {
            name: 'main',
            nodes: []
        };
    
        for (const fragment of svf.fragments) {
            const node = this.serializeFragment(fragment, svf);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                const index = this.manifest.nodes.length;
                this.manifest.nodes.push(node);
                scene.nodes.push(index);
            }
        }
    
        for (const material of svf.materials) {
            const mat = this.serializeMaterial(material, svf);
            this.manifest.materials.push(mat);
        }

        return scene;
    }

    protected serializeFragment(fragment: IFragment, svf: ISvf): IGltfNode {
        let node: IGltfNode = {
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
            const mesh = this.serializeMesh(fragmesh, svf);
            node.mesh = this.manifest.meshes.length;
            this.manifest.meshes.push(mesh);
            for (const primitive of mesh.primitives) {
                primitive.material = fragment.materialID;
            }
        } else {
            console.warn('Could not find mesh for fragment', fragment, 'geometry', geometry);
        }
        return node;
    }

    protected serializeMesh(fragmesh: IMesh, svf: ISvf): IGltfMesh {
        let mesh: IGltfMesh = {
            primitives: []
        };

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > BufferSizeLimit) {
            if (this.bufferStream) {
                this.bufferStream.close();
                this.bufferStream = null;
                this.bufferSize = 0;
            }
            const bufferUri = `${this.manifest.buffers.length}.bin`;
            this.manifest.buffers.push({ uri: bufferUri, byteLength: 0 });
            this.bufferStream = fse.createWriteStream(path.join(this.baseDir, bufferUri));
        }

        const bufferID = this.manifest.buffers.length - 1;
        const buffer = this.manifest.buffers[bufferID];
        const bufferViews = this.manifest.bufferViews;
        const accessors = this.manifest.accessors;
        // Don't output UVs until we specify the UV channels in materials
        const hasUVs = false; // fragmesh.uvmaps && fragmesh.uvmaps.length > 0;

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

    protected serializeMaterial(mat: IMaterial | null, svf: ISvf): IGltfMaterial {
        if (!mat) {
            return DefaultMaterial;
        }

        let material: IGltfMaterial = {
            pbrMetallicRoughness: {
                baseColorFactor: mat.diffuse,
                metallicFactor: mat.metal ? 1.0 : 0.0,
                roughnessFactor: mat.glossiness
            }
        };
        if (!isUndefined(mat.opacity) && material.pbrMetallicRoughness.baseColorFactor) {
            material.alphaMode = 'BLEND';
            material.pbrMetallicRoughness.baseColorFactor[3] = mat.opacity;
        }
        if (mat.maps) {
            if (mat.maps.diffuse) {
                const textureID = this.manifest.textures.length;
                this.manifest.textures.push(this.serializeTexture(mat.maps.diffuse, svf));
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: textureID,
                    texCoord: 1
                };
            }
        }
        return material;
    }

    protected serializeTexture(map: IMaterialMap, svf: ISvf): IGltfTexture {
        this.downloads.push(this.downloadTexture(map.uri, svf));
        const imageID = this.manifest.images.length;
        this.manifest.images.push({ uri: map.uri });
        return {
            source: imageID
        };
    }

    protected async downloadTexture(uri: string, svf: ISvf): Promise<string> {
        const img = await svf.getDerivative(uri);
        fse.writeFileSync(path.join(this.baseDir, uri), img);
        return uri;
    }
}

export async function serialize(svf: ISvf, baseDir: string) {
    fse.ensureDirSync(baseDir);
    const serializer = new GltfSerializer(baseDir);
    return serializer.serialize(svf);
}
