import * as IMF from '../common/intermediate-format';
import * as SVF2 from './interfaces';

export class Scene implements IMF.IScene {
    constructor(protected view: SVF2.IView) { }

    getMetadata(): IMF.IMetadata {
        return this.view.metadata;
    }

    getNodeCount(): number {
        return this.view.fragments.length;
    }

    getNode(id: number): IMF.Node {
        const frag = this.view.fragments[id];
        const node: IMF.IObjectNode = {
            kind: IMF.NodeKind.Object,
            dbid: frag.dbId,
            geometry: frag.geomId,
            material: frag.materialId
        };
        if (frag.transform) {
            node.transform = {
                kind: IMF.TransformKind.Decomposed,
                translation: frag.transform.translation,
                rotation: frag.transform.quaternion,
                scale: frag.transform.scale,
            };
        }
        return node;
    }

    getGeometryCount(): number {
        return this.view.geometries.length;
    }

    getGeometry(id: number): IMF.Geometry {
        if (id > this.view.geometries.length || id === 0) {
            return { kind: IMF.GeometryKind.Empty };
        }
        const geom = this.view.geometries[id - 1];
        switch (geom.type) {
            case SVF2.GeometryType.Triangles:
                const meshGeometry: IMF.IMeshGeometry = {
                    kind: IMF.GeometryKind.Mesh,
                    getIndices: () => geom.indices,
                    getVertices: () => geom.vertices,
                    getNormals: () => geom.normals,
                    getColors: () => geom.colors,
                    getUvChannelCount: () => 0,
                    getUvs: (channel: number) => new Float32Array(),
                }
                return meshGeometry;
            case SVF2.GeometryType.Lines:
                const lineGeometry: IMF.ILineGeometry = {
                    kind: IMF.GeometryKind.Lines,
                    getIndices: () => geom.indices,
                    getVertices: () => geom.vertices,
                    getColors: () => undefined
                };
                return lineGeometry;
        }
        return { kind: IMF.GeometryKind.Empty };
    }

    getMaterialCount(): number {
        return this.view.materials.length;
    }

    getMaterial(id: number): IMF.Material {
        return {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: 0.0,
            roughness: 0.0,
            opacity: 1.0
        };
        // const _mat = this.view.materials[id][0]; // should fix this remove one array level
        // const mat: IMF.IPhysicalMaterial = {
        //     kind: IMF.MaterialKind.Physical,
        //     diffuse: { x: 0, y: 0, z: 0 },
        //     metallic: _mat?.metal ? 1.0 : 0.0,
        //     opacity: _mat?.opacity ?? 1.0,
        //     roughness: _mat?.glossiness ? (20.0 / _mat.glossiness) : 1.0, // TODO: how to map glossiness to roughness properly?
        //     scale: { x: _mat?.maps?.diffuse?.scale.texture_UScale ?? 1.0, y: _mat?.maps?.diffuse?.scale.texture_VScale ?? 1.0 }
        // };
        // if (_mat?.diffuse) {
        //     mat.diffuse.x = _mat.diffuse[0];
        //     mat.diffuse.y = _mat.diffuse[1];
        //     mat.diffuse.z = _mat.diffuse[2];
        // }
        // if (_mat?.metal && _mat.specular && _mat.glossiness) {
        //     mat.diffuse.x = _mat.specular[0];
        //     mat.diffuse.y = _mat.specular[1];
        //     mat.diffuse.z = _mat.specular[2];
        //     mat.roughness = 60 / _mat.glossiness;
        // }
        // if (_mat?.maps?.diffuse) {
        //     mat.maps = mat.maps || {};
        //     mat.maps.diffuse = _mat.maps.diffuse.uri
        // }
        // return mat;
    }

    getImage(uri: string): Buffer | undefined {
        return this.view.textures.get(uri);
    }
}