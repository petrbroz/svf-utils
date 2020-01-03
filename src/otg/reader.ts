import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as OtgClient, SharedClient as OtgSharedClient, ManifestHelper as OtgManifestHelper, ViewHelper as OtgViewHelper } from './client';
import { parseGeometryHashes } from './geometry-hashes';
import { parseMaterialHashes } from './material-hashes';
import { parseFragments } from './fragments';
import { parseGeometry } from './geometries';

interface IOtg {
    views: IOtgView[];
}

interface IOtgView {
    id: string;
    fragments: any[];
    geometries: Map<string, any>;
    materials: Map<string, any>;
}

export class Reader {
    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions): Promise<Reader> {
        urn = urn.replace(/=/g, '');
        let otgClient: OtgClient;
        let sharedClient: OtgSharedClient;
        if ('token' in auth) {
            otgClient = new OtgClient({ token: auth.token });
            sharedClient = new OtgSharedClient({ token: auth.token });
        } else {
            const authClient = new AuthenticationClient(auth.client_id, auth.client_secret);
            const newAuth = await authClient.authenticate(['viewables:read', 'data:read']);
            otgClient = new OtgClient({ token: newAuth.access_token });
            sharedClient = new OtgSharedClient({ token: newAuth.access_token });
        }

        const manifest = await otgClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.guid === guid);
        console.assert(viewable);
        console.assert(viewable.role === 'viewable');
        console.assert('otg_manifest' in viewable);
        return new Reader(urn, viewable.otg_manifest, otgClient, sharedClient);
    }

    protected constructor(protected urn: string, protected manifest: any, protected client: OtgClient, protected sharedClient: OtgSharedClient) {
    }

    async read(): Promise<IOtg> {
        const otgManifestHelper = new OtgManifestHelper(this.manifest);
        let views: IOtgView[] = [];
        for (const view of otgManifestHelper.listViews()) {
            console.assert(view.role === 'graphics');
            console.assert(view.mime === 'application/autodesk-otg');
            views.push(await this.readView(view.id, view.resolvedUrn));
        }
        return {
            views
        };
    }

    protected async readView(id: string, resolvedUrn: string): Promise<IOtgView> {
        let fragments: any[] = [];
        let geometries: Map<string, any> = new Map<string, any>();
        let materials: Map<string, any> = new Map<string, any>();
        const viewData = await this.client.getAsset(this.urn, resolvedUrn);
        const otgViewHelper = new OtgViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        let tasks: Promise<void>[] = [];
        if (privateModelAssets) {
            if (privateModelAssets.fragments) {
                tasks.push(this.parseFragments(privateModelAssets.fragments.resolvedUrn, fragments));
            }
            if (privateModelAssets.geometry_ptrs) {
                tasks.push(this.parseGeometries(privateModelAssets.geometry_ptrs.resolvedUrn, otgViewHelper, geometries));
            }
            if (privateModelAssets.materials_ptrs) {
                tasks.push(this.parseMaterials(privateModelAssets.materials_ptrs.resolvedUrn, otgViewHelper, materials));
            }
        }
        await Promise.all(tasks);
        return {
            id,
            fragments,
            geometries,
            materials
        };
    }

    protected async parseFragments(fragListUrn: string, output: any[]): Promise<void> {
        const fragmentData = await this.client.getAsset(this.urn, fragListUrn);
        for (const fragment of parseFragments(fragmentData)) {
            output.push(fragment);
        }
    }

    protected async parseGeometries(geomHashListUrn: string, otgViewHelper: OtgViewHelper, output: Map<string, any>): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, geomHashListUrn);
        for (const hash of parseGeometryHashes(assetData)) {
            const geometryUrn = otgViewHelper.getGeometryUrn(hash);
            const geometryData = await this.sharedClient.getAsset(this.urn, geometryUrn);
            output.set(hash, parseGeometry(geometryData));
        }
    }

    protected async parseMaterials(matHashListUrn: string, otgViewHelper: OtgViewHelper, output: Map<string, any>): Promise<void> {
        const assetData = await this.client.getAsset(this.urn, matHashListUrn);
        for (const hash of parseMaterialHashes(assetData)) {
            const materialUrn = otgViewHelper.getMaterialUrn(hash);
            const materialData = await this.sharedClient.getAsset(this.urn, materialUrn);
            output.set(hash, JSON.parse(materialData.toString()));
        }
    }
}
