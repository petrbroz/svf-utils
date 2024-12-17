import { ModelDataClient } from './helpers/ModelDataClient';
import { SharedDataClient } from './helpers/SharedDataClient';
import { ManifestHelper } from './helpers/ManifestHelper';
import { ViewHelper } from './helpers/ViewHelper';
import { parseHashes } from './hashes';
import { parseFragments } from './fragments';
import { parseGeometry } from './geometries';
import { parseMaterial } from './materials';
import * as SVF2 from './interfaces';
import { PropDbReader } from '../common/propdb-reader';

export class Reader {
    static async FromDerivativeService(urn: string, accessToken: string): Promise<Reader> {
        const modelDataClient = new ModelDataClient(accessToken);
        const sharedDataClient = new SharedDataClient(accessToken);
        const manifest = await modelDataClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.role === 'viewable' && child.otg_manifest);
        console.assert(viewable, 'Could not find a viewable with SVF2 data');
        return new Reader(urn, viewable.otg_manifest, modelDataClient, sharedDataClient);
    }

    protected constructor(protected urn: string,
        protected manifest: any,
        protected modelDataClient: ModelDataClient,
        protected sharedDataClient: SharedDataClient) {}

    protected properties: PropDbReader | undefined;

    async read(): Promise<SVF2.IModel> {
        const manifestHelper = new ManifestHelper(this.manifest);
        let views: SVF2.IView[] = [];
        for (const view of manifestHelper.listViews()) {
            if (view.role === 'graphics' && view.mime === 'application/autodesk-otg') {
                views.push(await this.readView(view.id, view.resolvedUrn));
                break; // for now, only export one view
            }
        }
        return { views };
    }

    protected async readView(id: string, resolvedViewUrn: string): Promise<SVF2.IView> {
        // TODO: Decode property database
        const viewData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(resolvedViewUrn));
        const viewHelper = new ViewHelper(JSON.parse(viewData.toString()), resolvedViewUrn);
        const privateModelAssets = viewHelper.listPrivateModelAssets();
        const metadata = viewHelper.getMetadata();
        const fragments = await this.readFragments(privateModelAssets!.fragments.resolvedUrn);
        const geometries = await this.readGeometries(privateModelAssets!.geometry_ptrs.resolvedUrn, viewHelper);
        const materials = await this.readMaterials(privateModelAssets!.materials_ptrs.resolvedUrn, viewHelper);
        const textures = new Map(); // await this.readTextures(privateModelAssets!.texture_manifest.resolvedUrn, viewHelper);
        console.assert(privateModelAssets, 'Missing privateModelAssets!');
        return { id, metadata, fragments, geometries, materials, textures };
    }

    protected async readFragments(fragListUrn: string): Promise<SVF2.IFragment[]> {
        const fragmentData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(fragListUrn));
        return Array.from(parseFragments(fragmentData));
    }

    protected async readGeometries(geomHashListUrn: string, viewHelper: ViewHelper): Promise<SVF2.Geometry[]> {
        const geometries: SVF2.Geometry[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(geomHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const geometryUrn = viewHelper.getGeometryUrn(hash);
            const geometryData = await this.sharedDataClient.getAsset(this.urn, geometryUrn);
            geometries.push(parseGeometry(geometryData));
        }
        return geometries;
    }

    protected async readMaterials(matHashListUrn: string, viewHelper: ViewHelper): Promise<SVF2.IMaterial[]> {
        const materials: SVF2.IMaterial[] = [];
        const assetData = await this.modelDataClient.getAsset(this.urn, encodeURIComponent(matHashListUrn));
        for (const hash of parseHashes(assetData)) {
            const materialUrn = viewHelper.getMaterialUrn(hash);
            const materialData = await this.sharedDataClient.getAsset(this.urn, materialUrn);
            materials.push(parseMaterial(materialData));
        }
        return materials;
    }

    protected async readTextures(textureManifestUri: string, viewHelper: ViewHelper): Promise<Map<string, any>> {
        return new Map();
        // const assetData = await this.client.getAsset(this.urn, encodeURIComponent(textureManifestUri));
        // const textureManifest = JSON.parse(assetData.toString()) as { [key: string]: string }
        // for (const [_, uri] of Object.entries(textureManifest)) {
        //     console.log(`Downloading image ${uri} ...`)
        //     const textureUrn = viewHelper.getTextureUrn(uri);
        //     const textureData = await this.sharedClient.getAsset(this.urn, textureUrn);
        //     output.set(uri, textureData)
        //     console.log(`Downloading image ${uri}: done`)
        // }
    }

    protected async getPropertyDb(viewHelper: ViewHelper): Promise<PropDbReader> {
        const privateDbAssets = viewHelper.listPrivateDatabaseAssets();
        const sharedDbAssets = viewHelper.listSharedDatabaseAssets();

        if (privateDbAssets === undefined || sharedDbAssets === undefined) {
            throw new Error('Could not parse property database. Some of the database assets are missing.');
        }

        const offsetsAsset = privateDbAssets['offsets'];
        const avsAsset = privateDbAssets['avs'];
        const dbIdAsset = privateDbAssets['dbid'];

        const idsAsset = sharedDbAssets['ids'];
        const attrsAsset = sharedDbAssets['attrs'];
        const valsAsset = sharedDbAssets['values'];

        const buffers = await Promise.all([
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(idsAsset.resolvedUrn)),
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(offsetsAsset.resolvedUrn)),
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(avsAsset.resolvedUrn)),
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(attrsAsset.resolvedUrn)),
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(valsAsset.resolvedUrn)),
            await this.modelDataClient.getAsset(this.urn, encodeURIComponent(dbIdAsset.resolvedUrn)),
        ]);

        // SVF common function not working with private db assets
        return new PropDbReader(buffers[0], buffers[1], buffers[2], buffers[3], buffers[4]);
    }
}