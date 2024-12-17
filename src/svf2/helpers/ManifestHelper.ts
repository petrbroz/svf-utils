import * as path from 'path';

interface IView {
    id: string;
    role: string;
    mime: string;
    resolvedUrn: string;
}

interface IPropertyDbAsset {
    tag: string;
    type: string;
    resolvedUrn: string;
}

export class ManifestHelper {
    constructor(protected manifest: any) {
        console.assert(manifest.version === 1);
        console.assert(manifest.progress === 'complete');
        console.assert(manifest.status === 'success');
    }

    get sharedRoot() { return this.manifest.paths.shared_root; }

    listViews(): IView[] {
        const versionRoot = this.manifest.paths.version_root;
        return Object.entries(this.manifest.views).map(([id, view]: [string, any]) => {
            return {
                id,
                role: view.role,
                mime: view.mime,
                urn: view.urn,
                resolvedUrn: path.normalize(path.join(versionRoot, view.urn))
            };
        });
    }

    listSharedDatabaseAssets(): IPropertyDbAsset[] {
        const pdbManifest = this.manifest.pdb_manifest;
        const sharedRoot = this.manifest.paths.shared_root;
        return pdbManifest.assets.filter((asset: any) => asset.isShared).map((asset: any) => {
            return {
                tag: asset.tag,
                type: asset.type,
                uri: asset.uri,
                resolvedUrn: path.normalize(path.join(sharedRoot, pdbManifest.pdb_shared_rel_path, asset.uri))
            };
        });
    }
}