import axios from 'axios';
import { IAuthenticationProvider } from '../../common/authentication-provider';
import { Scopes } from '@aps_sdk/authentication';

export class ModelDataClient {
    protected readonly axios = axios.create({
        baseURL: 'https://cdn.derivative.autodesk.com/modeldata',
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

    /**
     * Retrieves the Model Derivative manifest augmented with OTG information.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @returns {Promise<any>} Model Derivative manifest augmented with OTG information.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async getManifest(urn: string): Promise<any> {
        const { data } = await this.axios.get(`manifest/${urn}`);
        return data;
    }

    /**
     * Retrieves raw data of specific OTG asset.
     * @async
     * @param {string} urn Model Derivative model URN.
     * @param {string} assetUrn OTG asset URN, typically composed from OTG "version root" or "shared root",
     * path to OTG view JSON, etc.
     * @returns {Promise<Buffer>} Asset data.
     * @throws Error when the request fails, for example, due to insufficient rights, or incorrect scopes.
     */
    async getAsset(urn: string, assetUrn: string): Promise<Buffer> {
        const { data } = await this.axios.get(`file/${assetUrn}?acmsession=${urn}`, { responseType: 'arraybuffer' });
        return data;
    }
}