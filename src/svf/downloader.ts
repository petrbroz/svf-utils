import * as path from 'path';
import * as fse from 'fs-extra';
import { ModelDerivativeClient, ManifestHelper, IDerivativeResourceChild } from 'forge-server-utils';
import { SvfReader } from '..';

export class Downloader {
    protected auth: { client_id: string; client_secret: string; };
    protected modelDerivativeClient: ModelDerivativeClient;

    constructor(client_id: string, client_secret: string) {
        this.auth = { client_id, client_secret };
        this.modelDerivativeClient = new ModelDerivativeClient(this.auth);
    }

    async download(urn: string, outputDir: string): Promise<void> {
        const helper = new ManifestHelper(await this.modelDerivativeClient.getManifest(urn));
        const derivatives = helper.search({ type: 'resource', role: 'graphics' }) as IDerivativeResourceChild[];
        const urnDir = path.join(outputDir, urn);
        for (const derivative of derivatives.filter(d => d.mime === 'application/autodesk-svf')) {
            const guid = derivative.guid;
            const guidDir = path.join(urnDir, guid);
            fse.ensureDirSync(guidDir);
            const svf = await this.modelDerivativeClient.getDerivative(urn, derivative.urn);
            fse.writeFileSync(path.join(guidDir, 'output.svf'), svf);
            const reader = await SvfReader.FromDerivativeService(urn, guid, this.auth);
            const manifest = await reader.getManifest();
            for (const asset of manifest.assets) {
                if (!asset.URI.startsWith('embed:')) {
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
