import axios from 'axios';
import { Scopes } from '@aps_sdk/authentication';
import { IAuthenticationProvider } from '../../common/authentication-provider';

export class SharedDataHttpClient {
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
        const [_, account, type, hash] = assetUrn.split('/');
        const cdnUrn = [hash.substring(0, 4), account, type, hash.substring(4)].join('/');
        const { data } = await this.axios.get(cdnUrn + `?acmsession=${urn}`, { responseType: 'arraybuffer' });
        return data;
    }
}