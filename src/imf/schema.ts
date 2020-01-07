// Intermediate 3D format schema

export type NodeID = number;
export type GeometryID = number;
export type MaterialID = number;
export type CameraID = number;
export type LightID = number;

export interface IScene {
    getMetadata(): { [key: string]: any };
    getNodeCount(): number;
    getNode(id: NodeID): Node;
    getGeometryCount(): number;
    getGeometry(id: GeometryID): Geometry;
    getMaterialCount(): number;
    getMaterial(id: MaterialID): Material;
    getCameraCount(): number;
    getCamera(id: CameraID): Camera;
    getLightCount(): number;
    getLight(id: LightID): Light;
}

export interface IVec3 {
    x: number;
    y: number;
    z: number;
}

export interface IQuaternion {
    x: number;
    y: number;
    z: number;
    w: number;
}

export enum TransformKind {
    Matrix,
    Decomposed
}

export interface IMatrixTransform {
    kind: TransformKind.Matrix;
    elements: number[];
}

export interface IDecomposedTransform {
    kind: TransformKind.Decomposed;
    translation?: IVec3;
    rotation?: IQuaternion;
    scale?: IVec3;
}

export type Transform = IMatrixTransform | IDecomposedTransform;

export enum NodeKind {
    Group,
    Object,
    Camera,
    Light
}

export interface IGroupNode {
    kind: NodeKind.Group;
    dbid: number;
    transform?: Transform;
    children: NodeID[];
}

export interface IObjectNode {
    kind: NodeKind.Object;
    dbid: number;
    transform?: Transform;
    geometry: GeometryID;
    material: MaterialID;
}

export interface ICameraNode {
    kind: NodeKind.Camera;
    transform?: Transform;
    camera: CameraID;
}

export interface ILightNode {
    kind: NodeKind.Light;
    transform?: Transform;
    light: LightID;
}

export type Node = IGroupNode | IObjectNode | ICameraNode | ILightNode;

export enum GeometryKind {
    Mesh,
    Lines,
    Points,
    Empty
}

export interface IMeshGeometry {
    kind: GeometryKind.Mesh;
    getIndices(): Uint16Array;
    getVertices(): Float32Array;
    getNormals(): Float32Array | undefined;
    getUvChannelCount(): number;
    getUvs(channel: number): Float32Array;
}

export interface ILineGeometry {
    kind: GeometryKind.Lines;
    getIndices(): Uint16Array;
    getVertices(): Float32Array;
    getColors(): Float32Array | undefined;
}

export interface IPointGeometry {
    kind: GeometryKind.Points;
    getVertices(): Float32Array;
    getColors(): Float32Array | undefined;
}

export interface IEmptyGeometry {
    kind: GeometryKind.Empty;
}

export type Geometry = IMeshGeometry | ILineGeometry | IPointGeometry | IEmptyGeometry;

export enum MaterialKind {
    Physical
}

export interface IPhysicalMaterial {
    kind: MaterialKind.Physical;
    diffuse: IVec3;
    metallic: number;
    opacity: number;
}

export type Material = IPhysicalMaterial;

export enum CameraKind {
    Perspective,
    Orthogonal
}

export interface IPerspectiveCamera {
    kind: CameraKind.Perspective;
}

export interface IOrthographicCamera {
    kind: CameraKind.Orthogonal;
}

export type Camera = IPerspectiveCamera | IOrthographicCamera;

export enum LightKind {
    Spot
}

export interface ISpotLight {
    kind: LightKind.Spot;
}

export type Light = ISpotLight;
