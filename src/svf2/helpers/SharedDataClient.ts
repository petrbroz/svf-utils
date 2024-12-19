import axios from 'axios';
import { IAuthenticationProvider } from '../../common/authentication-provider';
import { Scopes } from '@aps_sdk/authentication';

export class SharedDataClient {
    protected readonly axios = axios.create({
        baseURL: 'https://cdn.derivative.autodesk.com/cdn',
        headers: {
            'Pragma': 'no-cache'
        }
    });

    constructor(protected readonly authenticationProvider: IAuthenticationProvider) {
        this.axios.interceptors.request.use(async config => {
            const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
            config.headers['Authorization'] = `Bearer ${accessToken}`;
            return config;
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