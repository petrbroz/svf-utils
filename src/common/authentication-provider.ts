import { AuthenticationClient, Scopes } from "@aps_sdk/authentication";
import { SdkManagerBuilder } from "@aps_sdk/autodesk-sdkmanager";

export interface IAuthenticationProvider {
    getToken(scopes: Scopes[]): Promise<string>;
}

export class BasicAuthenticationProvider implements IAuthenticationProvider {
    constructor(protected accessToken: string) {}

    async getToken(scopes: Scopes[]): Promise<string> {
        // TODO: check if the hard-coded token has all the needed scopes
        return this.accessToken;
    }
}

export class TwoLeggedAuthenticationProvider implements IAuthenticationProvider {
    protected authenticationClient: AuthenticationClient;

    constructor(protected clientId: string, protected clientSecret: string) {
        this.authenticationClient = new AuthenticationClient(SdkManagerBuilder.create().build());
    }

    async getToken(scopes: Scopes[]): Promise<string> {
        const credentials = await this.authenticationClient.getTwoLeggedToken(this.clientId, this.clientSecret, scopes);
        return credentials.access_token as string;
    }
}