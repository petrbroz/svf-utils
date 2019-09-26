import * as path from 'path';
import * as fse from 'fs-extra';

import * as gltf from './helpers/gltf-schema';
import { ISvf } from './svf';
import { IFragment, IMaterial, IMesh, IMaterialMap } from 'forge-server-utils/dist/svf';
import { isUndefined } from 'util';

const BufferSizeLimit = 5 << 20;
const DefaultMaterial: gltf.MaterialPbrMetallicRoughness = {
    pbrMetallicRoughness: {
        baseColorFactor: [0.25, 0.25, 0.25, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.5
    }
};

export class GltfSerializer {
    protected manifest: gltf.GlTf;
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
        const manifestScenes = this.manifest.scenes as gltf.Scene[];
        manifestScenes.push(this.serializeScene(svf));
        this.manifest.scene = 0;
        const gltfPath = path.join(this.baseDir, 'output.gltf');
        fse.writeFileSync(gltfPath, JSON.stringify(this.manifest, null, 4));
        await Promise.all(this.downloads); // Wait for all pending downloads to finish
    }

    protected serializeScene(svf: ISvf): gltf.Scene {
        let scene: gltf.Scene = {
            name: 'main',
            nodes: []
        };
        const manifestNodes = this.manifest.nodes as gltf.Node[];
        const manifestMaterials = this.manifest.materials as gltf.MaterialPbrMetallicRoughness[];

        for (const fragment of svf.fragments) {
            const node = this.serializeFragment(fragment, svf);
            // Only output nodes that have a mesh
            if (!isUndefined(node.mesh)) {
                const index = manifestNodes.length;
                manifestNodes.push(node);
                (scene.nodes as number[]).push(index);
            }
        }

        for (const material of svf.materials) {
            const mat = this.serializeMaterial(material, svf);
            manifestMaterials.push(mat);
        }

        return scene;
    }

    protected serializeFragment(fragment: IFragment, svf: ISvf): gltf.Node {
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
            const mesh = this.serializeMesh(fragmesh, svf);
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

    protected serializeMesh(fragmesh: IMesh, svf: ISvf): gltf.Mesh {
        let mesh: gltf.Mesh = {
            primitives: []
        };

        const manifestBuffers = this.manifest.buffers as gltf.Buffer[];

        // Prepare new writable stream if needed
        if (this.bufferStream === null || this.bufferSize > BufferSizeLimit) {
            if (this.bufferStream) {
                this.bufferStream.close();
                this.bufferStream = null;
                this.bufferSize = 0;
            }
            const bufferUri = `${manifestBuffers.length}.bin`;
            manifestBuffers.push({ uri: bufferUri, byteLength: 0 });
            this.bufferStream = fse.createWriteStream(path.join(this.baseDir, bufferUri));
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

    protected serializeMaterial(mat: IMaterial | null, svf: ISvf): gltf.MaterialPbrMetallicRoughness {
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
                manifestTextures.push(this.serializeTexture(mat.maps.diffuse, svf));
                material.pbrMetallicRoughness.baseColorTexture = {
                    index: textureID,
                    texCoord: 0
                };
            }
        }
        return material;
    }

    protected serializeTexture(map: IMaterialMap, svf: ISvf): gltf.Texture {
        this.downloads.push(this.downloadTexture(map.uri, svf));
        const manifestImages = this.manifest.images as gltf.Image[];
        const imageID = manifestImages.length;
        manifestImages.push({ uri: map.uri });
        return {
            source: imageID
        };
    }

    protected async downloadTexture(uri: string, svf: ISvf): Promise<string> {
        const img = await svf.getDerivative(uri.toLowerCase());
        const filepath = path.join(this.baseDir, uri);
        fse.ensureDirSync(path.dirname(filepath));
        fse.writeFileSync(filepath, img);
        return uri;
    }
}

export async function serialize(svf: ISvf, baseDir: string) {
    fse.ensureDirSync(baseDir);
    const serializer = new GltfSerializer(baseDir);
    return serializer.serialize(svf);
}
