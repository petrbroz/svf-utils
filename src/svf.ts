import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import * as svf from 'forge-server-utils/dist/svf';

export interface ISvf {
    metadata: svf.ISvfMetadata;
    fragments: svf.IFragment[];
    geometries: svf.IGeometryMetadata[];
    meshpacks: (svf.IMesh | null)[][];
    materials: (svf.IMaterial | null)[];
    getDerivative: (uri: string) => Promise<Buffer>;
}

export async function deserialize(urn: string, guid: string, auth: IAuthOptions): Promise<ISvf> {
    const modelDerivativeClient = new ModelDerivativeClient(auth);
    const helper = new ManifestHelper(await modelDerivativeClient.getManifest(urn));
    const svfDerivatives = helper.search({ type: 'resource', role: 'graphics', guid });
    if (svfDerivatives.length === 0) {
        throw new Error(`Guid ${guid} not found in urn ${urn}.`);
    }
    const svfDerivative = svfDerivatives[0] as IDerivativeResourceChild;
    const buffer = await modelDerivativeClient.getDerivative(urn, svfDerivative.urn);
    const { manifest, metadata } = svf.parseManifest(buffer as Buffer);
    const baseUri = svfDerivative.urn.substr(0, svfDerivative.urn.lastIndexOf('/'));
    let output: ISvf = {
        metadata,
        fragments: [],
        geometries: [],
        meshpacks: [],
        materials: [],
        getDerivative: async (uri: string) => {
            const buffer = await modelDerivativeClient.getDerivative(urn, baseUri + '/' + uri) as Buffer;
            return buffer;
        }
    };
    let tasks: Promise<void>[] = [];
    for (const asset of manifest.assets) {
        if (asset.URI.startsWith('embed:')) {
            continue; // For now we only expect 'manifest.json' and 'metadata.json' to be embedded
        }
        const assetUri = baseUri + '/' + asset.URI;
        switch (asset.type) {
            case svf.AssetType.FragmentList:
                console.log(`Parsing fragments (${assetUri})...`);
                tasks.push(deserializeFragments(urn, assetUri, output, modelDerivativeClient));
                break;
            case svf.AssetType.GeometryMetadataList:
                console.log(`Parsing geometry metadata (${assetUri})...`);
                tasks.push(deserializeGeometries(urn, assetUri, output, modelDerivativeClient));
                break;
            case svf.AssetType.PackFile:
                console.log(`Parsing mesh pack (${assetUri})...`);
                const typeset = manifest.typesets[parseInt(asset.typeset || '')];
                if (typeset.types[0].class === 'Autodesk.CloudPlatform.Geometry') {
                    let meshpack: svf.IMesh[] = [];
                    output.meshpacks.push(meshpack);
                    tasks.push(deserializeMeshes(urn, assetUri, meshpack, modelDerivativeClient));
                }
                break;
            case svf.AssetType.ProteinMaterials:
                if (assetUri.indexOf('ProteinMaterials.json.gz') !== -1) {
                    continue; // Ignore the advanced materials, we only support basic materials (Materials.json.gz)
                }
                console.log(`Parsing materials (${assetUri})...`);
                tasks.push(deserializeMaterials(urn, assetUri, output, modelDerivativeClient));
                break;
            default:
                console.log(`Skipping unsupported asset type: ${asset.type}`);
                break;
        }
    }
    await Promise.all(tasks);
    return output;
}

async function deserializeFragments(urn: string, assetUri: string, output: ISvf, client: ModelDerivativeClient) {
    const buffer = await client.getDerivative(urn, assetUri);
    output.fragments = Array.from(svf.parseFragments(buffer as Buffer));
}

async function deserializeGeometries(urn: string, assetUri: string, output: ISvf, client: ModelDerivativeClient) {
    const buffer = await client.getDerivative(urn, assetUri);
    output.geometries = Array.from(svf.parseGeometries(buffer as Buffer));
}

async function deserializeMeshes(urn: string, assetUri: string, meshpack: (svf.IMesh | null)[], client: ModelDerivativeClient) {
    const buffer = await client.getDerivative(urn, assetUri);
    for (const mesh of svf.parseMeshes(buffer as Buffer)) {
        meshpack.push(mesh);
    }
}

async function deserializeMaterials(urn: string, assetUri: string, output: ISvf, client: ModelDerivativeClient) {
    const buffer = await client.getDerivative(urn, assetUri);
    output.materials = Array.from(svf.parseMaterials(buffer as Buffer));
}
