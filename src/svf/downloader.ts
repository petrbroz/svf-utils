import * as path from 'path';
import * as fse from 'fs-extra';
import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { IAuthOptions, Region } from 'forge-server-utils/dist/common';
import { SvfReader } from '..';

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

    constructor(protected auth: IAuthOptions, host?: string, region?: Region) {
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth, host, region);
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

    private async _download(urn: string, context: IDownloadContext): Promise<void> {
        context.log(`Downloading derivative ${urn}`);
        const helper = new ManifestHelper(await this.modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' }) as IDerivativeResourceChild[];
        const urnDir = path.join(context.outputDir || '.', urn);
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            if (context.cancelled) {
                return;
            }
            const guid = derivative.guid;
            context.log(`Downloading viewable ${guid}`);
            const guidDir = path.join(urnDir, guid);
            fse.ensureDirSync(guidDir);
            const svf = await this.modelDerivativeClient.getDerivative(urn, encodeURI(derivative.urn));
            fse.writeFileSync(path.join(guidDir, 'output.svf'), new Uint8Array(svf));
            const reader = await SvfReader.FromDerivativeService(urn, guid, this.auth);
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
