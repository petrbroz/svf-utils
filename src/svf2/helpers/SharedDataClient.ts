import axios, { AxiosInstance } from 'axios';

export class SharedDataClient {
    protected readonly axios: AxiosInstance;

    constructor(accessToken: string) {
        this.axios = axios.create({
            baseURL: 'https://cdn.derivative.autodesk.com/cdn',
            headers: {
                'Pragma': 'no-cache',
                'Authorization': `Bearer ${accessToken}`
            }
        });
    }

    async getAsset(urn: string, assetUrn: string): Promise<Buffer> {
        const assetUrnTokens = assetUrn.split('/');
        const account = assetUrnTokens[1];
        const assetType = assetUrnTokens[2];
        const assetHash = assetUrnTokens[3];
        const cdnUrn = [assetHash.substring(0, 4), account, assetType, assetHash.substring(4)].join('/'); // `${assetHash.substring(0, 4)}/${account}/${assetType}/${assetHash.substring(4)}`;
        const { data } = await this.axios.get(cdnUrn + `?acmsession=${urn}`, { responseType: 'arraybuffer' });
        return data;
    }
}