declare module 'gltf-pipeline' {
    export function processGltf(manifest: any, options: any): Promise<any>;
    export function processGlb(manifest: any, options: any): Promise<any>;
    export function gltfToGlb(manifest: any, options: any): Promise<any>;
    export function glbToGltf(manifest: any, options: any): Promise<any>;
}
