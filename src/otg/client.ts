import { ForgeClient, IAuthOptions } from 'forge-server-utils/dist/common';

const ApiHost = 'https://otg.autodesk.com'
const RootPath = 'modeldata';
const ReadTokenScopes = ['bucket:read', 'data:read'];

export class Client extends ForgeClient {
    constructor(auth: IAuthOptions) {
        super(RootPath, auth, ApiHost);
        this.axios.defaults.headers = this.axios.defaults.headers || {};
        this.axios.defaults.headers['Pragma'] = 'no-cache';
    }

    async getManifest(urn: string): Promise<any> {
        return this.get(`manifest/${urn}`, {}, ReadTokenScopes);
    }

    async getAsset(modelUrn: string, derivativeUrn: string): Promise<Buffer> {
        return this.getBuffer(`file/${derivativeUrn}?acmsession=${modelUrn}`, {}, ReadTokenScopes);
    }
}
