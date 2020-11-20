import * as path from 'path';
import * as zlib from 'zlib';
import * as fse from 'fs-extra';
import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { IAuthOptions } from 'forge-server-utils/dist/common';

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

    constructor(protected auth: IAuthOptions) {
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth);
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
        const urnDir = path.join(context.outputDir, urn);
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-f2d')) {
            if (context.cancelled) {
                return;
            }
            const guid = derivative.guid;
            context.log(`Downloading viewable ${guid}`);
            const guidDir = path.join(urnDir, guid);
            fse.ensureDirSync(guidDir);
            const baseUrn = derivative.urn.substr(0, derivative.urn.lastIndexOf('/'));
            const manifestGzip = await this.modelDerivativeClient.getDerivative(urn, baseUrn + '/manifest.json.gz');
            fse.writeFileSync(path.join(guidDir, 'manifest.json.gz'), new Uint8Array(manifestGzip));
            const manifestGunzip = zlib.gunzipSync(manifestGzip);
            const manifest = JSON.parse(manifestGunzip.toString());
            for (const asset of manifest.assets) {
                if (context.cancelled) {
                    return;
                }
                context.log(`Downloading asset ${asset.URI}`);
                try {
                    const assetData = await this.modelDerivativeClient.getDerivative(urn, baseUrn + '/' + asset.URI);
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
