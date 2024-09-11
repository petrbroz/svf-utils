import * as path from 'path';
import * as fse from 'fs-extra';
import axios from 'axios';
import { SvfReader } from '..';
import { IAuthenticationProvider } from '../common/authentication-provider';
import { ManifestResources, ModelDerivativeClient, Region } from '@aps_sdk/model-derivative';
import { Scopes } from '@aps_sdk/authentication';

export interface IDownloadOptions {
    region?: Region
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
    protected readonly modelDerivativeClient = new ModelDerivativeClient();

    constructor(protected authenticationProvider: IAuthenticationProvider) {}

    download(urn: string, options?: IDownloadOptions): IDownloadTask {
        const context: IDownloadContext = {
            log: options?.log || ((message: string) => {}),
            outputDir: options?.outputDir || '.',
            cancelled: false,
            failOnMissingAssets: !!options?.failOnMissingAssets
        };
        return {
            ready: this._download(urn, context, options?.region),
            cancel: () => { context.cancelled = true; }
        };
    }

    private async _downloadDerivative(urn: string, derivativeUrn: string, region?: Region) {
        try {
            const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
            const downloadInfo = await this.modelDerivativeClient.getDerivativeUrl(derivativeUrn, urn, { accessToken, region });
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

    private async _download(urn: string, context: IDownloadContext, region?: Region): Promise<void> {
        context.log(`Downloading derivative ${urn} (region: ${region || 'default'})`);
        const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
        const manifest = await this.modelDerivativeClient.getManifest(urn, { accessToken, region });
        const urnDir = path.join(context.outputDir || '.', urn);

        const derivatives: ManifestResources[] = [];
        function collectDerivatives(derivative: ManifestResources) {
            if (derivative.type === 'resource' && derivative.role === 'graphics' && (derivative as any).mime === 'application/autodesk-svf') {
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

        for (const derivative of derivatives) {
            if (context.cancelled) {
                return;
            }
            const guid = derivative.guid;
            context.log(`Downloading viewable ${guid}`);
            const guidDir = path.join(urnDir, guid);
            fse.ensureDirSync(guidDir);
            const svf = await this._downloadDerivative(urn, encodeURI((derivative as any).urn), region);
            fse.writeFileSync(path.join(guidDir, 'output.svf'), new Uint8Array(svf));
            const reader = await SvfReader.FromDerivativeService(urn, guid, this.authenticationProvider, region);
            const manifest = await reader.getManifest();
            for (const asset of manifest.assets) {
                if (context.cancelled) {
                    return;
                }
                if (!asset.URI.startsWith('embed:')) {
                    context.log(`Downloading asset ${asset.URI}`);
                    try {
                        const assetData = await reader.getAsset(asset.URI);
                        const assetPath = path.join(guidDir, asset.URI);
                        const assetFolder = path.dirname(assetPath);
                        fse.ensureDirSync(assetFolder);
                        fse.writeFileSync(assetPath, assetData);
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
}
