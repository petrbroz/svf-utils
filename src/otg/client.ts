import * as path from 'path';
import { ForgeClient, IAuthOptions } from 'forge-server-utils/dist/common';

const ApiHost = 'https://otg.autodesk.com'
const RootPath = 'modeldata';
const ReadTokenScopes = ['bucket:read', 'data:read'];
const WriteTokenScopes = ['data:write'];

export interface IView {
    urn: string;
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

export class ViewHelper {
    constructor(protected view: any, protected resolvedViewUrn: string) {
    }

    listPrivateModelAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const assets = this.view.manifest && this.view.manifest.assets;
        if (assets) {
            let result: { [key: string]: { uri: string; resolvedUrn: string; } } = {};
            if (assets.fragments) {
                result.fragments = {
                    uri: assets.fragments,
                    resolvedUrn: this.resolveAssetUrn(assets.fragments)
                };
            }
            if (assets.fragments_extra) {
                result.fragments_extra = {
                    uri: assets.fragments_extra,
                    resolvedUrn: this.resolveAssetUrn(assets.fragments_extra)
                };
            }
            if (assets.materials_ptrs) {
                result.materials_ptrs = {
                    uri: assets.materials_ptrs,
                    resolvedUrn: this.resolveAssetUrn(assets.materials_ptrs)
                };
            }
            if (assets.geometry_ptrs) {
                result.geometry_ptrs = {
                    uri: assets.geometry_ptrs,
                    resolvedUrn: this.resolveAssetUrn(assets.geometry_ptrs)
                };
            }
            return result;
        } else {
            return undefined;
        }
    }

    listSharedModelAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const assets = this.view.manifest && this.view.manifest.shared_assets;
        if (assets) {
            let result: { [key: string]: { uri: string; resolvedUrn: string; } } = {};
            if (assets.geometry) {
                result.geometry = {
                    uri: assets.geometry,
                    resolvedUrn: this.resolveAssetUrn(assets.geometry)
                };
            }
            if (assets.materials) {
                result.materials = {
                    uri: assets.materials,
                    resolvedUrn: this.resolveAssetUrn(assets.materials)
                };
            }
            if (assets.textures) {
                result.textures = {
                    uri: assets.textures,
                    resolvedUrn: this.resolveAssetUrn(assets.textures)
                };
            }
            return result;
        } else {
            return undefined;
        }
    }

    listPrivateDatabaseAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const pdb = this.view.manifest && this.view.manifest.assets && this.view.manifest.assets.pdb;
        if (pdb) {
            return {
                avs: {
                    uri: pdb.avs,
                    resolvedUrn: this.resolveAssetUrn(pdb.avs)
                },
                offsets: {
                    uri: pdb.offsets,
                    resolvedUrn: this.resolveAssetUrn(pdb.offsets)
                },
                dbid: {
                    uri: pdb.dbid,
                    resolvedUrn: this.resolveAssetUrn(pdb.dbid)
                }
            };
        } else {
            return undefined;
        }
    }

    listSharedDatabaseAssets(): ({ [key: string]: { uri: string; resolvedUrn: string; } } | undefined) {
        const pdb = this.view.manifest && this.view.manifest.shared_assets && this.view.manifest.shared_assets.pdb;
        if (pdb) {
            return {
                attrs: {
                    uri: pdb.attrs,
                    resolvedUrn: this.resolveAssetUrn(pdb.attrs)
                },
                values: {
                    uri: pdb.values,
                    resolvedUrn: this.resolveAssetUrn(pdb.values)
                },
                ids: {
                    uri: pdb.ids,
                    resolvedUrn: this.resolveAssetUrn(pdb.ids)
                }
            };
        } else {
            return undefined;
        }
    }

    resolveAssetUrn(assetUrn: string): string {
        if (assetUrn.startsWith('urn:')) {
            return assetUrn;
        } else {
            return path.normalize(
                path.join(path.dirname(this.resolvedViewUrn), assetUrn)
            );
        }
    }

    getGeometryUrn(hash: string): string {
        return this.view.manifest.shared_assets.geometry + hash;
    }

    getMaterialUrn(hash: string): string {
        return this.view.manifest.shared_assets.materials + hash;
    }

    getTextureUrn(hash: string): string {
        return this.view.manifest.shared_assets.textures + hash;
    }
}

/**
 * Client for the OTG service (https://otg.autodesk.com).
 */
export class Client extends ForgeClient {

    /**
     * Initializes the client with specific authentication and host address.
     * @param {IAuthOptions} auth Authentication object,
     * containing either `client_id` and `client_secret` properties (for 2-legged authentication),
     * or a single `token` property (for 2-legged or 3-legged authentication with pre-generated access token).
     * @param {string} [host="https://otg.autodesk.com"] OTG service host.
     */
    constructor(auth: IAuthOptions, host: string = ApiHost) {
        super(RootPath, auth, host);
        this.axios.defaults.headers = this.axios.defaults.headers || {};
        this.axios.defaults.headers['Pragma'] = 'no-cache';
    }

    /**
     * Triggers processing of OTG derivatives for a specific model.
     * Note: the model must already be processed into SVF using the Model Derivative service.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @param {string} [account] Optional account ID.
     * @param {boolean} [force] Optional flag to force the translation.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async createDerivatives(urn: string, account?: string, force?: boolean): Promise<any> {
        const params: { [key: string]: any } = { urn };
        if (account) {
            params['account_id'] = account;
        }
        if (force) {
            params['force_conversion'] = force;
        }
        return this.post(``, params, {}, WriteTokenScopes);
    }

    /**
     * Removes OTG derivatives for a specific model.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async deleteDerivatives(urn: string): Promise<any> {
        return this.delete(urn, {}, WriteTokenScopes);
    }

    /**
     * Retrieves the Model Derivative manifest augmented with OTG information.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @returns {Promise<any>} Model Derivative manifest augmented with OTG information.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async getManifest(urn: string): Promise<any> {
        return this.get(`manifest/${urn}`, {}, ReadTokenScopes);
    }

    /**
     * Retrieves raw data of specific OTG asset.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @param {string} assetUrn OTG asset URN, typically composed from OTG "version root" or "shared root",
     * path to OTG view JSON, etc.
     * @returns {Promise<Buffer>} Asset data.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async getAsset(urn: string, assetUrn: string): Promise<Buffer> {
        return this.getBuffer(`file/${assetUrn}?acmsession=${urn}`, {}, ReadTokenScopes);
    }
}

export class SharedClient extends ForgeClient {
    protected sharding: number = 4;

    constructor(auth: IAuthOptions, host: string = ApiHost) {
        super('cdn', auth, host);
        this.axios.defaults.headers = this.axios.defaults.headers || {};
        this.axios.defaults.headers['Pragma'] = 'no-cache';
    }

    async getAsset(urn: string, assetUrn: string): Promise<Buffer> {
        const assetUrnTokens = assetUrn.split('/');
        const account = assetUrnTokens[1];
        const assetType = assetUrnTokens[2];
        const assetHash = assetUrnTokens[3];
        const cdnUrn = `${assetHash.substr(0, 4)}/${account}/${assetType}/${assetHash.substr(4)}`;
        return this.getBuffer(cdnUrn + `?acmsession=${urn}`, {}, ReadTokenScopes);
    }
}
