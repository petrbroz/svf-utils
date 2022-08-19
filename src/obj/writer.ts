import * as IMF from '../common/intermediate-format';
import fs from 'fs';
import { vec3, vec4, quat, mat4 } from 'gl-matrix';

export class Writer {
    private verticesWritten: number = 0;

    constructor() {
    }

    async write(imf: IMF.IScene, output: string): Promise<any> {
        this.verticesWritten = 0;
        const ws = fs.createWriteStream(output)
        this.writeScene(ws, imf)
        ws.close();
    }

    protected writeScene(ws: fs.WriteStream, scene: IMF.IScene): void {
        for (let i = 0, len = scene.getNodeCount(); i < len; i++) {
            const node = scene.getNode(i);
            if (node.kind == IMF.NodeKind.Object) {
                this.writeObject(ws, node, scene);
            }
        }
    }

    protected writeObject(ws: fs.WriteStream, node: IMF.IObjectNode, scene: IMF.IScene): void {
        let matrix = mat4.create();
        if (node.transform) {
            switch (node.transform.kind) {
                case IMF.TransformKind.Matrix:
                    for (let i = 0; i < 16; i++) {
                        matrix[i] = node.transform.elements[i];
                    }
                    break;
                case IMF.TransformKind.Decomposed:
                    let scale = vec3.fromValues(1.0, 1.0, 1.0);
                    if (node.transform.scale) {
                        scale[0] = node.transform.scale.x;
                        scale[1] = node.transform.scale.y;
                        scale[2] = node.transform.scale.z;
                    }
                    let rotation = quat.create();
                    if (node.transform.rotation) {
                        rotation[0] = node.transform.rotation.x;
                        rotation[1] = node.transform.rotation.y;
                        rotation[2] = node.transform.rotation.z;
                        rotation[3] = node.transform.rotation.w;
                    }
                    let translation = vec3.create();
                    if (node.transform.translation) {
                        translation[0] = node.transform.translation.x;
                        translation[1] = node.transform.translation.y;
                        translation[2] = node.transform.translation.z;
                    }
                    mat4.fromRotationTranslationScale(matrix, rotation, translation, scale);
                    break;
            }
        }

        const geometry = scene.getGeometry(node.geometry);
        if (geometry.kind === IMF.GeometryKind.Mesh) {
            ws.write(`# Node ${node.dbid}\n`);
            ws.write(`o ${node.dbid}\n`);
            const vertices = geometry.getVertices();
            for (let i = 0, len = vertices.length; i < len; i += 3) {
                let vertex = vec4.fromValues(vertices[i], vertices[i + 1], vertices[i + 2], 1.0);
                let transformedVertex = vec4.create();
                vec4.transformMat4(transformedVertex, vertex, matrix);
                ws.write(`v ${transformedVertex[0]} ${transformedVertex[1]} ${transformedVertex[2]}\n`);
            }
            const indices = geometry.getIndices();
            for (let i = 0, len = indices.length; i < len; i += 3) {
                ws.write(`f ${this.verticesWritten + 1 + indices[i]} ${this.verticesWritten + 1 + indices[i + 1]} ${this.verticesWritten + 1 + indices[i + 2]}\n`);
            }
            this.verticesWritten += vertices.length / 3;
        }
    }
}
