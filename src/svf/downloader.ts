import * as path from 'path';
import * as fse from 'fs-extra';
import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { SvfReader } from '..';

export interface IDownloadOptions {
    outputDir?: string;
    log?: (message: string) => void;
}

export interface IDownloadTask {
    ready: Promise<void>;
    cancel: () => void;
}

interface IDownloadContext {
    log: (message: string) => void;
    outputDir: string;
    cancelled: boolean;
}

export class Downloader {
    protected auth: { client_id: string; client_secret: string; };
    protected modelDerivativeClient: ModelDerivativeClient;

    constructor(client_id: string, client_secret: string) {
        this.auth = { client_id, client_secret };
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth);
    }

    download(urn: string, options?: IDownloadOptions): IDownloadTask {
        const context: IDownloadContext = {
            log: options?.log || ((message: string) => {}),
            outputDir: options?.outputDir || '.',
            cancelled: false
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
            const svf = await this.modelDerivativeClient.getDerivative(urn, derivative.urn);
            fse.writeFileSync(path.join(guidDir, 'output.svf'), svf);
            const reader = await SvfReader.FromDerivativeService(urn, guid, this.auth);
            const manifest = await reader.getManifest();
            for (const asset of manifest.assets) {
                if (context.cancelled) {
                    return;
                }
                if (!asset.URI.startsWith('embed:')) {
                    context.log(`Downloading asset ${asset.URI}`);
                    const assetData = await reader.getAsset(asset.URI);
                    const assetPath = path.join(guidDir, asset.URI);
                    const assetFolder = path.dirname(assetPath);
                    fse.ensureDirSync(assetFolder);
                    fse.writeFileSync(assetPath, assetData);
                }
            }
        }
    }
}
