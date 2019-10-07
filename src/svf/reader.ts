import * as path from 'path';
import * as fse from 'fs-extra';
import Zip from 'adm-zip';
import { isNullOrUndefined } from 'util';

import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { PropDbReader } from '../common/propdb-reader';
import { parseFragments } from './fragments';
import { parseGeometries } from './geometries';
import { parseMaterials } from './materials';
import { parseMeshes } from './meshes';
import * as schema from './schema';

/**
 * Entire content of SVF and its assets loaded in memory.
 */
export interface ISvfContent {
    metadata: schema.ISvfMetadata;
    fragments: schema.IFragment[];
    geometries: schema.IGeometryMetadata[];
    meshpacks: (schema.IMesh | schema.ILines | schema.IPoints | null)[][];
    materials: (schema.IMaterial | null)[];
    properties: PropDbReader;
    images: { [uri: string]: Buffer };
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
 * const svf = await reader.read(); // Read entire SVF into memory
 * console.log(svf);
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
     * @returns {Promise<Reader>} Reader for the provided SVF.
     */
    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions): Promise<Reader> {
        const modelDerivativeClient = new ModelDerivativeClient(auth);
        const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
        const resources = helper.search({ type: 'resource', role: 'graphics', guid });
        if (resources.length === 0) {
            throw new Error(`Viewable '${guid}' not found.`);
        }
        const svfUrn = (resources[0] as IDerivativeResourceChild).urn;
        const svf = await modelDerivativeClient.getDerivative(urn, svfUrn) as Buffer;
        const baseUri = svfUrn.substr(0, svfUrn.lastIndexOf('/'));
        const resolve = async (uri: string) => {
            const buffer = await modelDerivativeClient.getDerivative(urn, baseUri + '/' + uri) as Buffer;
            return buffer;
        };
        return new Reader(svf, resolve);
    }

    protected svf: schema.ISvfRoot;

    protected constructor(svf: Buffer, protected resolve: (uri: string) => Promise<Buffer>) {
        const zip = new Zip(svf);
        const manifest = JSON.parse(zip.getEntry('manifest.json').getData().toString()) as schema.ISvfManifest;
        const metadata = JSON.parse(zip.getEntry('metadata.json').getData().toString()) as schema.ISvfMetadata;
        const embedded: { [key: string]: Buffer } = {};
        zip.getEntries().filter(entry => entry.name !== 'manifest.json' && entry.name !== 'metadata.json').forEach((entry) => {
            embedded[entry.name] = entry.getData();
        });
        this.svf = { manifest, metadata, embedded };
    }

    /**
     * Reads the entire SVF and all its referenced assets into memory.
     * In cases where a more granular control is needed (for example, when trying to control
     * memory consumption), consider parsing the different SVF elements individually,
     * using methods like {@link readFragments}, {@link enumerateGeometries}, etc.
     */
    async read(): Promise<ISvfContent> {
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

        tasks.push((async () => {
            output.fragments = await this.readFragments();
        })());
        tasks.push((async () => {
            output.geometries = await this.readGeometries();
        })());
        tasks.push((async () => {
            output.materials = await this.readMaterials();
        })());
        tasks.push((async () => {
            output.properties = await this.getPropertyDb();
        })());
        for (let i = 0, len = this.getMeshPackCount(); i < len; i++) {
            tasks.push((async (id: number) => {
                output.meshpacks[id] = await this.readMeshPack(id);
            })(i));
        }
        for (const img of this.listImages()) {
            tasks.push((async (uri: string) => {
                try {
                    // Sometimes, Model Derivative service URIs must be left unmodified...
                    output.images[uri.toLowerCase()] = await this.getAsset(uri);
                } catch(err) {
                    // ... and sometimes they must be lower-cased :/
                    output.images[uri.toLowerCase()] = await this.getAsset(uri.toLowerCase());
                }
            })(img));
        }
        await Promise.all(tasks);
        return output as ISvfContent;
    }

    protected findAsset(query: { type?: schema.AssetType, uri?: string }): schema.ISvfManifestAsset | undefined {
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
     * @returns {Promise<schema.ISvfMetadata>} SVF metadata.
     */
    async getMetadata(): Promise<schema.ISvfMetadata> {
        return this.svf.metadata;
    }

    /**
     * Retrieves, parses, and iterates over all SVF fragments.
     * @async
     * @generator
     * @returns {AsyncIterable<schema.IFragment>} Async iterator over parsed fragments.
     */
    async *enumerateFragments(): AsyncIterable<schema.IFragment> {
        const fragmentAsset = this.findAsset({ type: schema.AssetType.FragmentList });
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
    async readFragments(): Promise<schema.IFragment[]> {
        const fragmentAsset = this.findAsset({ type: schema.AssetType.FragmentList });
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
     * @returns {AsyncIterable<schema.IGeometryMetadata>} Async iterator over parsed geometry metadata.
     */
    async *enumerateGeometries(): AsyncIterable<schema.IGeometryMetadata> {
        const geometryAsset = this.findAsset({ type: schema.AssetType.GeometryMetadataList });
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
     * @returns {Promise<schema.IGeometryMetadata[]>} List of parsed geometry metadata.
     */
    async readGeometries(): Promise<schema.IGeometryMetadata[]> {
        const geometryAsset = this.findAsset({ type: schema.AssetType.GeometryMetadataList });
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
            if (asset.type === schema.AssetType.PackFile && asset.URI.match(/^\d+\.pf$/)) {
                count++;
            }
        });
        return count;
    }

    /**
     * Retrieves, parses, and iterates over all meshes, lines, or points in a specific SVF meshpack.
     * @async
     * @generator
     * @returns {AsyncIterable<schema.IMesh | schema.ILines | schema.IPoints | null>} Async iterator over parsed meshes,
     * lines, or points (or null values for unsupported mesh types).
     */
    async *enumerateMeshPack(packNumber: number): AsyncIterable<schema.IMesh | schema.ILines | schema.IPoints | null> {
        const meshPackAsset = this.findAsset({ type: schema.AssetType.PackFile, uri: `${packNumber}.pf` });
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
     * @returns {Promise<(schema.IMesh | schema.ILines | schema.IPoints | null)[]>} List of parsed meshes,
     * lines, or points (or null values for unsupported mesh types).
     */
    async readMeshPack(packNumber: number): Promise<(schema.IMesh | schema.ILines | schema.IPoints | null)[]> {
        const meshPackAsset = this.findAsset({ type: schema.AssetType.PackFile, uri: `${packNumber}.pf` });
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
     * @returns {AsyncIterable<schema.IMaterial | null>} Async iterator over parsed materials
     * (or null values for unsupported material types).
     */
    async *enumerateMaterials(): AsyncIterable<schema.IMaterial | null> {
        const materialsAsset = this.findAsset({ type: schema.AssetType.ProteinMaterials, uri: `Materials.json.gz` });
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
     * @returns {Promise<(schema.IMaterial | null)[]>} List of parsed materials (or null values for unsupported material types).
     */
    async readMaterials(): Promise<(schema.IMaterial | null)[]> {
        const materialsAsset = this.findAsset({ type: schema.AssetType.ProteinMaterials, uri: `Materials.json.gz` });
        if (!materialsAsset) {
            throw new Error(`Materials not found.`);
        }
        const buffer = await this.getAsset(materialsAsset.URI);
        return Array.from(parseMaterials(buffer));
    }

    /**
     * Finds URIs of all image assets referenced in the SVF.
     * These can then be retrieved using {@link getAsset}.
     * @returns {string[]} Image asset URIs.
     */
    listImages(): string[] {
        return this.svf.manifest.assets
            .filter(asset => asset.type === schema.AssetType.Image)
            .map(asset => asset.URI);
    }

    /**
     * Retrieves and parses the property database.
     * @async
     * @returns {Promise<PropDbReader>} Property database reader.
     */
    async getPropertyDb(): Promise<PropDbReader> {
        const idsAsset = this.findAsset({ type: schema.AssetType.PropertyIDs });
        const offsetsAsset = this.findAsset({ type: schema.AssetType.PropertyOffsets });
        const avsAsset = this.findAsset({ type: schema.AssetType.PropertyAVs });
        const attrsAsset = this.findAsset({ type: schema.AssetType.PropertyAttributes });
        const valsAsset = this.findAsset({ type: schema.AssetType.PropertyValues });
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
