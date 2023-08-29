import * as path from 'path';
import * as fse from 'fs-extra';
import Zip from 'adm-zip';
import { isNullOrUndefined } from 'util';

import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { IAuthOptions, Region } from 'forge-server-utils/dist/common';
import { PropDbReader } from '../common/propdb-reader';
import { parseFragments } from './fragments';
import { parseGeometries } from './geometries';
import { parseMaterials } from './materials';
import { parseMeshes } from './meshes';
import * as SVF from './schema';
import * as IMF from '../common/intermediate-format';

/**
 * Entire content of SVF and its assets loaded in memory.
 */
export interface ISvfContent {
    metadata: SVF.ISvfMetadata;
    fragments: SVF.IFragment[];
    geometries: SVF.IGeometryMetadata[];
    meshpacks: (SVF.IMesh | SVF.ILines | SVF.IPoints | null)[][];
    materials: (SVF.IMaterial | null)[];
    properties: PropDbReader;
    images: { [uri: string]: Buffer };
}

export class Scene implements IMF.IScene {
    constructor(protected svf: ISvfContent) {}

    getMetadata(): IMF.IMetadata {
        return this.svf.metadata.metadata;
    }

    getNodeCount(): number {
        return this.svf.fragments.length;
    }

    getNode(id: number): IMF.Node {
        const frag = this.svf.fragments[id];
        const node: IMF.IObjectNode = {
            kind: IMF.NodeKind.Object,
            dbid: frag.dbID,
            geometry: frag.geometryID,
            material: frag.materialID
        };
        if (frag.transform) {
            if ('matrix' in frag.transform) {
                const { matrix, t } = frag.transform;
                node.transform = {
                    kind: IMF.TransformKind.Matrix,
                    elements: [
                        matrix[0], matrix[1], matrix[2], 0,
                        matrix[3], matrix[4], matrix[5], 0,
                        matrix[6], matrix[7], matrix[8], 0,
                        t ? t.x : 0, t ? t.y : 0, t ? t.z : 0, 1
                    ]
                };
            } else {
                node.transform = { kind: IMF.TransformKind.Decomposed };
                if ('q' in frag.transform) {
                    node.transform.rotation = frag.transform.q;
                }
                if ('s' in frag.transform) {
                    node.transform.scale = frag.transform.s;
                }
                if ('t' in frag.transform) {
                    node.transform.translation = frag.transform.t;
                }
            }
        }
        return node;
    }

    getGeometryCount(): number {
        return this.svf.geometries.length;
    }

    getGeometry(id: number): IMF.Geometry {
        const meta = this.svf.geometries[id];
        const mesh = this.svf.meshpacks[meta.packID][meta.entityID];
        if (mesh) {
            if ('isLines' in mesh) {
                const geom: IMF.ILineGeometry = {
                    kind: IMF.GeometryKind.Lines,
                    getIndices: () => mesh.indices,
                    getVertices: () => mesh.vertices,
                    getColors: () => mesh.colors
                };
                return geom;
            } else if ('isPoints' in mesh) {
                const geom: IMF.IPointGeometry = {
                    kind: IMF.GeometryKind.Points,
                    getVertices: () => mesh.vertices,
                    getColors: () => mesh.colors
                };
                return geom;
            } else {
                const geom: IMF.IMeshGeometry = {
                    kind: IMF.GeometryKind.Mesh,
                    getIndices: () => mesh.indices,
                    getVertices: () => mesh.vertices,
                    getNormals: () => mesh.normals,
                    getColors: () => mesh.colors,
                    getUvChannelCount: () => mesh.uvcount,
                    getUvs: (channel: number) => mesh.uvmaps[channel].uvs
                };
                return geom;
            }
        }
        return { kind: IMF.GeometryKind.Empty };
    }

    getMaterialCount(): number {
        return this.svf.materials.length;
    }

    getMaterial(id: number): IMF.Material {
        const _mat = this.svf.materials[id];
        const mat: IMF.IPhysicalMaterial = {
            kind: IMF.MaterialKind.Physical,
            diffuse: { x: 0, y: 0, z: 0 },
            metallic: _mat?.metal ? 1.0 : 0.0,
            opacity: _mat?.opacity ?? 1.0,
            roughness: _mat?.glossiness ? ( 20.0/ _mat.glossiness ) : 1.0, // TODO: how to map glossiness to roughness properly?
            scale: {x: _mat?.maps?.diffuse?.scale.texture_UScale ?? 1.0 , y: _mat?.maps?.diffuse?.scale.texture_VScale ?? 1.0}
        };
        if (_mat?.diffuse) {
            mat.diffuse.x = _mat.diffuse[0];
            mat.diffuse.y = _mat.diffuse[1];
            mat.diffuse.z = _mat.diffuse[2];
        }
        if (_mat?.metal && _mat.specular && _mat.glossiness) {
            mat.diffuse.x = _mat.specular[0];
            mat.diffuse.y = _mat.specular[1];
            mat.diffuse.z = _mat.specular[2];
            mat.roughness = 60/_mat.glossiness;
        }   
        if (_mat?.maps?.diffuse) {
            mat.maps = mat.maps || {};
            mat.maps.diffuse = _mat.maps.diffuse.uri
        }
        return mat;
    }

    getImage(uri: string): Buffer | undefined {
        return this.svf.images[uri];
    }
}

/**
 * Additional options when reading the entire SVF.
 */
export interface IReaderOptions {
    log?: (msg: string) => void;
    skipPropertyDb?: boolean;
    filter?: (dbid: number, fragid: number) => boolean;
}

/**
 * Utility class for parsing & reading SVF content from Model Derivative service
 * or from local file system.
 *
 * The class can only be instantiated using one of the two async static methods:
 * {@link Reader.FromFileSystem}, or {@link Reader.FromDerivativeService}.
 * After that, you can parse the entire SVF into memory using {@link parse}, or parse
 * individual SVF objects using methods like {@link readFragments} or {@link enumerateGeometries}.
 *
 * @example
 * const auth = { client_id: 'forge client id', client_secret: 'forge client secreet' };
 * const reader = await Reader.FromDerivativeService('model urn', 'viewable guid', auth);
 * const scene = await reader.read(); // Read entire scene into an intermediate, in-memory representation
 * console.log(scene);
 *
 * @example
 * const reader = await Reader.FromFileSystem('path/to/svf');
 * // Enumerate fragments (without building a list of all of them)
 * for await (const fragment of reader.enumerateFragments()) {
 *   console.log(fragment);
 * }
 */
export class Reader {
    /**
     * Instantiates new reader for an SVF on local file system.
     * @async
     * @param {string} filepath Path to the *.svf file.
     * @returns {Promise<Reader>} Reader for the provided SVF.
     */
    static async FromFileSystem(filepath: string): Promise<Reader> {
        const svf = fse.readFileSync(filepath);
        const baseDir = path.dirname(filepath);
        const resolve = async (uri: string) => {
            const buffer = fse.readFileSync(path.join(baseDir, uri));
            return buffer;
        };
        return new Reader(svf, resolve);
    }

    /**
     * Instantiates new reader for an SVF in Forge Model Derivative service.
     * @async
     * @param {string} urn Forge model URN.
     * @param {string} guid Forge viewable GUID. The viewable(s) can be found in the manifest
     * with type: 'resource', role: 'graphics', and mime: 'application/autodesk-svf'.
     * @param {IAuthOptions} auth Credentials or access token for accessing the Model Derivative service.
     * @param {string} host Optional host URL to be used by all Forge calls.
     * @param {Region} region Optional region to be used by all Forge calls.
     * @returns {Promise<Reader>} Reader for the provided SVF.
     */
    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions, host?: string, region?: Region): Promise<Reader> {
        urn = urn.replace(/=/g, '');
        const modelDerivativeClient = new ModelDerivativeClient(auth, host, region);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const resources = helper.search({ type: 'resource', role: 'graphics', guid });
        if (resources.length === 0) {
            throw new Error(`Viewable '${guid}' not found.`);
        }
        const svfUrn = (resources[0] as IDerivativeResourceChild).urn;
        const svf = await modelDerivativeClient.getDerivative(urn, encodeURI(svfUrn)) as Buffer;
        const baseUri = svfUrn.substr(0, svfUrn.lastIndexOf('/'));
        const resolve = async (uri: string) => {
            const encodedUri = encodeURI(baseUri  + '/' + uri);
            const buffer = await modelDerivativeClient.getDerivative(urn, encodedUri) as Buffer;
            return buffer;
        };
        return new Reader(svf, resolve);
    }

    protected svf: SVF.ISvfRoot;

    protected constructor(svf: Buffer, protected resolve: (uri: string) => Promise<Buffer>) {
        const zip = new Zip(svf);
        const manifestEntry = zip.getEntry('manifest.json');
        const metadataEntry = zip.getEntry('metadata.json');
        if (!manifestEntry) {
            throw new Error('Missing SVF asset: manifest.js');
        }
        if (!metadataEntry) {
            throw new Error('Missing SVF asset: metadata.js');
        }
        const manifest = JSON.parse(manifestEntry.getData().toString()) as SVF.ISvfManifest;
        const metadata = JSON.parse(metadataEntry.getData().toString()) as SVF.ISvfMetadata;
        const embedded: { [key: string]: Buffer } = {};
        zip.getEntries().filter(entry => entry.name !== 'manifest.json' && entry.name !== 'metadata.json').forEach((entry) => {
            embedded[entry.name] = entry.getData();
        });
        this.svf = { manifest, metadata, embedded };
    }

    /**
     * Reads the entire scene and all its referenced assets into memory.
     * In cases where a more granular control is needed (for example, when trying to control
     * memory consumption), consider parsing the different SVF elements individually,
     * using methods like {@link readFragments}, {@link enumerateGeometries}, etc.
     * @async
     * @param {IReaderOptions} [options] Additional reading options.
     * @returns {Promise<IMF.IScene>} Intermediate, in-memory representation of the loaded scene.
     */
    async read(options?: IReaderOptions): Promise<IMF.IScene> {
        let output: any = {
            metadata: await this.getMetadata(),
            fragments: [],
            geometries: [],
            meshpacks: [],
            materials: [],
            properties: null,
            images: {}
        };
        let tasks: Promise<void>[] = [];
        const log = (options && options.log) || function (msg: string) {};

        log(`Reading fragments...`);
        output.fragments = await this.readFragments();
        log(`Reading fragments: done`);

        log(`Reading geometries...`);
        output.geometries = await this.readGeometries();
        log(`Reading geometries: done`);

        log(`Reading materials...`);
        output.materials = await this.readMaterials();
        log(`Reading materials: done`);

        if (!(options && options.skipPropertyDb)) {
            tasks.push((async () => {
                log(`Reading property database...`);
                output.properties = await this.getPropertyDb();
                log(`Reading property database: done`);
            })());
        }

        if (options && options.filter) {
            const fragments = output.fragments as SVF.IFragment[];
            const geometries = output.geometries as SVF.IGeometryMetadata[];
            const packIds = new Set<number>();
            for (let i = 0, len = fragments.length; i < len; i++) {
                const fragment = fragments[i];
                if (options.filter(fragment.dbID, i)) {
                    packIds.add(geometries[fragment.geometryID].packID);
                }
            }
            for (const packId of packIds.values()) {
                tasks.push((async (id: number) => {
                    log(`Reading meshpack #${id}...`);
                    output.meshpacks[id] = await this.readMeshPack(id);
                    log(`Reading meshpack #${id}: done`);
                })(packId));
            }
        } else {
            for (let i = 0, len = this.getMeshPackCount(); i < len; i++) {
                tasks.push((async (id: number) => {
                    log(`Reading meshpack #${id}...`);
                    output.meshpacks[id] = await this.readMeshPack(id);
                    log(`Reading meshpack #${id}: done`);
                })(i));
            }
        }

        for (const img of this.listImages()) {
            tasks.push((async (uri: string) => {
                log(`Downloading image ${uri}...`);
                const { normalizedUri, imageData } = await this.loadImage(uri);
                output.images[normalizedUri] = imageData;
                log(`Downloading image ${uri}: done`);
            })(img));
        }
        await Promise.all(tasks);
        return new Scene(output);
    }

    protected findAsset(query: { type?: SVF.AssetType, uri?: string }): SVF.ISvfManifestAsset | undefined {
        return this.svf.manifest.assets.find(asset => {
            return (isNullOrUndefined(query.type) || asset.type === query.type)
                && (isNullOrUndefined(query.uri) || asset.URI === query.uri);
        });
    }

    /**
     * Retrieves raw binary data of a specific SVF asset.
     * @async
     * @param {string} uri Asset URI.
     * @returns {Promise<Buffer>} Asset content.
     */
    async getAsset(uri: string): Promise<Buffer> {
        return this.resolve(uri);
    }

    /**
     * Retrieves parsed SVF metadata.
     * @async
     * @returns {Promise<SVF.ISvfMetadata>} SVF metadata.
     */
    async getMetadata(): Promise<SVF.ISvfMetadata> {
        return this.svf.metadata;
    }

    /**
     * Retrieves parsed SVF manifest.
     * @async
     * @returns {Promise<SVF.ISvfManifest>} SVF manifest.
     */
    async getManifest(): Promise<SVF.ISvfManifest> {
        return this.svf.manifest;
    }

    /**
     * Retrieves, parses, and iterates over all SVF fragments.
     * @async
     * @generator
     * @returns {AsyncIterable<SVF.IFragment>} Async iterator over parsed fragments.
     */
    async *enumerateFragments(): AsyncIterable<SVF.IFragment> {
        const fragmentAsset = this.findAsset({ type: SVF.AssetType.FragmentList });
        if (!fragmentAsset) {
            throw new Error(`Fragment list not found.`);
        }
        const buffer = await this.getAsset(fragmentAsset.URI);
        for (const fragment of parseFragments(buffer)) {
            yield fragment;
        }
    }

    /**
     * Retrieves, parses, and collects all SVF fragments.
     * @async
     * @returns {Promise<IFragment[]>} List of parsed fragments.
     */
    async readFragments(): Promise<SVF.IFragment[]> {
        const fragmentAsset = this.findAsset({ type: SVF.AssetType.FragmentList });
        if (!fragmentAsset) {
            throw new Error(`Fragment list not found.`);
        }
        const buffer = await this.getAsset(fragmentAsset.URI);
        return Array.from(parseFragments(buffer));
    }

    /**
     * Retrieves, parses, and iterates over all SVF geometry metadata.
     * @async
     * @generator
     * @returns {AsyncIterable<SVF.IGeometryMetadata>} Async iterator over parsed geometry metadata.
     */
    async *enumerateGeometries(): AsyncIterable<SVF.IGeometryMetadata> {
        const geometryAsset = this.findAsset({ type: SVF.AssetType.GeometryMetadataList });
        if (!geometryAsset) {
            throw new Error(`Geometry metadata not found.`);
        }
        const buffer = await this.getAsset(geometryAsset.URI);
        for (const geometry of parseGeometries(buffer)) {
            yield geometry;
        }
    }


    /**
     * Retrieves, parses, and collects all SVF geometry metadata.
     * @async
     * @returns {Promise<SVF.IGeometryMetadata[]>} List of parsed geometry metadata.
     */
    async readGeometries(): Promise<SVF.IGeometryMetadata[]> {
        const geometryAsset = this.findAsset({ type: SVF.AssetType.GeometryMetadataList });
        if (!geometryAsset) {
            throw new Error(`Geometry metadata not found.`);
        }
        const buffer = await this.getAsset(geometryAsset.URI);
        return Array.from(parseGeometries(buffer));
    }

    /**
     * Gets the number of available mesh packs.
     */
    getMeshPackCount(): number {
        let count = 0;
        this.svf.manifest.assets.forEach(asset => {
            if (asset.type === SVF.AssetType.PackFile && asset.URI.match(/^\d+\.pf$/)) {
                count++;
            }
        });
        return count;
    }

    /**
     * Retrieves, parses, and iterates over all meshes, lines, or points in a specific SVF meshpack.
     * @async
     * @generator
     * @returns {AsyncIterable<SVF.IMesh | SVF.ILines | SVF.IPoints | null>} Async iterator over parsed meshes,
     * lines, or points (or null values for unsupported mesh types).
     */
    async *enumerateMeshPack(packNumber: number): AsyncIterable<SVF.IMesh | SVF.ILines | SVF.IPoints | null> {
        const meshPackAsset = this.findAsset({ type: SVF.AssetType.PackFile, uri: `${packNumber}.pf` });
        if (!meshPackAsset) {
            throw new Error(`Mesh packfile ${packNumber}.pf not found.`);
        }
        const buffer = await this.getAsset(meshPackAsset.URI);
        for (const mesh of parseMeshes(buffer)) {
            yield mesh;
        }
    }

    /**
     * Retrieves, parses, and collects all meshes, lines, or points in a specific SVF meshpack.
     * @async
     * @param {number} packNumber Index of mesh pack file.
     * @returns {Promise<(SVF.IMesh | SVF.ILines | SVF.IPoints | null)[]>} List of parsed meshes,
     * lines, or points (or null values for unsupported mesh types).
     */
    async readMeshPack(packNumber: number): Promise<(SVF.IMesh | SVF.ILines | SVF.IPoints | null)[]> {
        const meshPackAsset = this.findAsset({ type: SVF.AssetType.PackFile, uri: `${packNumber}.pf` });
        if (!meshPackAsset) {
            throw new Error(`Mesh packfile ${packNumber}.pf not found.`);
        }
        const buffer = await this.getAsset(meshPackAsset.URI);
        return Array.from(parseMeshes(buffer));
    }

    /**
     * Retrieves, parses, and iterates over all SVF materials.
     * @async
     * @generator
     * @returns {AsyncIterable<SVF.IMaterial | null>} Async iterator over parsed materials
     * (or null values for unsupported material types).
     */
    async *enumerateMaterials(): AsyncIterable<SVF.IMaterial | null> {
        const materialsAsset = this.findAsset({ type: SVF.AssetType.ProteinMaterials, uri: `Materials.json.gz` });
        if (!materialsAsset) {
            throw new Error(`Materials not found.`);
        }
        const buffer = await this.getAsset(materialsAsset.URI);
        for (const material of parseMaterials(buffer)) {
            yield material;
        }
    }

    /**
     * Retrieves, parses, and collects all SVF materials.
     * @async
     * @returns {Promise<(SVF.IMaterial | null)[]>} List of parsed materials (or null values for unsupported material types).
     */
    async readMaterials(): Promise<(SVF.IMaterial | null)[]> {
        const materialsAsset = this.findAsset({ type: SVF.AssetType.ProteinMaterials, uri: `Materials.json.gz` });
        if (!materialsAsset) {
            throw new Error(`Materials not found.`);
        }
        const buffer = await this.getAsset(materialsAsset.URI);
        return Array.from(parseMaterials(buffer));
    }

    /**
     * Loads an image.
     * @param uri Image URI.
     */
    async loadImage(uri: string) {
        const normalizedUri = uri.toLowerCase().split(/[\/\\]/).join(path.sep);
        let imageData = null;
        // Sometimes, Model Derivative service URIs must be left unmodified...
        try {
            imageData = await this.getAsset(uri);
        } catch (err) {}
        // Sometimes, they must be lower-cased...
        if (!imageData) {
            try {
                imageData = await this.getAsset(uri.toLowerCase());
            } catch (err) {}
        }
        // And sometimes, they're just missing...
        if (!imageData) {
            imageData = undefined;
        }
        return { normalizedUri, imageData };
    }

    /**
     * Finds URIs of all image assets referenced in the SVF.
     * These can then be retrieved using {@link getAsset}.
     * @returns {string[]} Image asset URIs.
     */
    listImages(): string[] {
        return this.svf.manifest.assets
            .filter(asset => asset.type === SVF.AssetType.Image)
            .map(asset => asset.URI);
    }

    /**
     * Retrieves and parses the property database.
     * @async
     * @returns {Promise<PropDbReader>} Property database reader.
     */
    async getPropertyDb(): Promise<PropDbReader> {
        const idsAsset = this.findAsset({ type: SVF.AssetType.PropertyIDs });
        const offsetsAsset = this.findAsset({ type: SVF.AssetType.PropertyOffsets });
        const avsAsset = this.findAsset({ type: SVF.AssetType.PropertyAVs });
        const attrsAsset = this.findAsset({ type: SVF.AssetType.PropertyAttributes });
        const valsAsset = this.findAsset({ type: SVF.AssetType.PropertyValues });
        if (!idsAsset || !offsetsAsset || !avsAsset || !attrsAsset || !valsAsset) {
            throw new Error('Could not parse property database. Some of the database assets are missing.');
        }
        const buffers = await Promise.all([
            this.getAsset(idsAsset.URI),
            this.getAsset(offsetsAsset.URI),
            this.getAsset(avsAsset.URI),
            this.getAsset(attrsAsset.URI),
            this.getAsset(valsAsset.URI)
        ]);
        return new PropDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);
    }
}
