import { AuthenticationClient } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';
import { Client as OtgClient, ManifestHelper as OtgManifestHelper, ViewHelper as OtgViewHelper } from './client';
import { parseGeometryHashes } from './geometry-hashes';
import { parseMaterialHashes } from './material-hashes';
import { parseFragments } from './fragments';

interface IOtg {
    views: IOtgView[];
}

interface IOtgView {
    id: string;
    fragments: any[];
    geometryHashes: string[];
    materialHashes: string[];
}

export class Reader {
    static async FromDerivativeService(urn: string, guid: string, auth: IAuthOptions): Promise<Reader> {
        urn = urn.replace(/=/g, '');
        let otgClient: OtgClient;
        if ('token' in auth) {
            otgClient = new OtgClient({ token: auth.token });
        } else {
            const authClient = new AuthenticationClient(auth.client_id, auth.client_secret);
            const newAuth = await authClient.authenticate(['viewables:read', 'data:read']);
            otgClient = new OtgClient({ token: newAuth.access_token });
        }

        const manifest = await otgClient.getManifest(urn);
        const viewable = manifest.children.find((child: any) => child.guid === guid);
        console.assert(viewable);
        console.assert(viewable.role === 'viewable');
        console.assert('otg_manifest' in viewable);
        return new Reader(urn, viewable.otg_manifest, otgClient);
    }

    protected constructor(protected urn: string, protected manifest: any, protected client: OtgClient) {
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
        let geometryHashes: string[] = [];
        let materialHashes: string[] = [];
        const viewData = await this.client.getAsset(this.urn, resolvedUrn);
        const otgViewHelper = new OtgViewHelper(JSON.parse(viewData.toString()), resolvedUrn);
        const privateModelAssets = otgViewHelper.listPrivateModelAssets();
        if (privateModelAssets) {
            if (privateModelAssets.geometry_ptrs) {
                const assetData = await this.client.getAsset(this.urn, privateModelAssets.geometry_ptrs.resolvedUrn);
                for (const hash of parseGeometryHashes(assetData)) {
                    geometryHashes.push(hash);
                }
            }
            if (privateModelAssets.materials_ptrs) {
                const assetData = await this.client.getAsset(this.urn, privateModelAssets.materials_ptrs.resolvedUrn);
                for (const hash of parseMaterialHashes(assetData)) {
                    materialHashes.push(hash);
                }
            }
            if (privateModelAssets.fragments) {
                const fragmentData = await this.client.getAsset(this.urn, privateModelAssets.fragments.resolvedUrn);
                for (const fragment of parseFragments(fragmentData)) {
                    fragments.push(fragment);
                }
            }
        }
        return {
            id,
            fragments,
            geometryHashes,
            materialHashes
        };
    }
}
