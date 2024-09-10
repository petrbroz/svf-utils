import * as path from 'path';
import * as zlib from 'zlib';
import * as fse from 'fs-extra';
import axios from 'axios';
import { ManifestResources, ModelDerivativeClient } from '@aps_sdk/model-derivative';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { Scopes } from '@aps_sdk/authentication';

export interface IDownloadOptions {
    outputDir?: string;
    log?: (message: string) => void;
    failOnMissingAssets?: boolean;
}

export interface IDownloadTask {
    ready: Promise<void>;
    cancel: () => void;
}

interface IDownloadContext {
    log: (message: string) => void;
    outputDir: string;
    cancelled: boolean;
    failOnMissingAssets: boolean;
}

export class Downloader {
    protected modelDerivativeClient: ModelDerivativeClient;

    constructor(protected authenticationProvider: IAuthenticationProvider) {
        this.modelDerivativeClient = new ModelDerivativeClient();
    }

    download(urn: string, options?: IDownloadOptions): IDownloadTask {
        const context: IDownloadContext = {
            log: options?.log || ((message: string) => {}),
            outputDir: options?.outputDir || '.',
            cancelled: false,
            failOnMissingAssets: !!options?.failOnMissingAssets
        };
        return {
            ready: this._download(urn, context),
            cancel: () => { context.cancelled = true; }
        };
    }

    private async _downloadDerivative(urn: string, derivativeUrn: string) {
        try {
            const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
            const downloadInfo = await this.modelDerivativeClient.getDerivativeUrl(derivativeUrn, urn, { accessToken });
            const response = await axios.get(downloadInfo.url as string, { responseType: 'arraybuffer', decompress: false });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                throw new Error(`Could not download derivative ${derivativeUrn}: ${error.message}`);
            } else {
                throw error;
            }
        }
    }

    private async _download(urn: string, context: IDownloadContext): Promise<void> {
        context.log(`Downloading derivative ${urn}`);
        const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
        const manifest = await this.modelDerivativeClient.getManifest(urn, { accessToken });
        let derivatives: ManifestResources[] = [];
        function collectDerivatives(derivative: ManifestResources) {
            if (derivative.type === 'resource' && derivative.role === 'graphics' && (derivative as any).mime === 'application/autodesk-f2d') {
                derivatives.push(derivative);
            }
            if (derivative.children) {
                for (const child of derivative.children) {
                    collectDerivatives(child);
                }
            }
        }
        for (const derivative of manifest.derivatives) {
            if (derivative.children) {
                for (const child of derivative.children) {
                    collectDerivatives(child);
                }
            }
        }
        const urnDir = path.join(context.outputDir, urn);
        for (const derivative of derivatives) {
            if (context.cancelled) {
                return;
            }
            const guid = derivative.guid;
            context.log(`Downloading viewable ${guid}`);
            const guidDir = path.join(urnDir, guid);
            fse.ensureDirSync(guidDir);
            const derivativeUrn = (derivative as any).urn;
            const baseUrn = derivativeUrn.substr(0, derivativeUrn.lastIndexOf('/'));
            const manifestGzip = await this._downloadDerivative(urn, baseUrn + '/manifest.json.gz');
            fse.writeFileSync(path.join(guidDir, 'manifest.json.gz'), new Uint8Array(manifestGzip as Buffer));
            const manifestGunzip = zlib.gunzipSync(manifestGzip);
            const manifest = JSON.parse(manifestGunzip.toString());
            for (const asset of manifest.assets) {
                if (context.cancelled) {
                    return;
                }
                context.log(`Downloading asset ${asset.URI}`);
                try {
                    const assetData = await this._downloadDerivative(urn, baseUrn + '/' + asset.URI);
                    fse.writeFileSync(path.join(guidDir, asset.URI), new Uint8Array(assetData));
                } catch (err) {
                    if (context.failOnMissingAssets) {
                        throw err;
                    } else {
                        context.log(`Could not download asset ${asset.URI}`);
                    }
                }
            }
        }
    }
}
