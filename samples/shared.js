const axios = require('axios').default;
const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { AuthenticationClient, Scopes } = require('@aps_sdk/authentication');
const { ModelDerivativeClient } = require('@aps_sdk/model-derivative');

async function downloadDerivative(urn, derivativeUrn, clientId, clientSecret) {
    const authenticationClient = new AuthenticationClient(SdkManagerBuilder.create().build());
    const modelDerivativeClient = new ModelDerivativeClient();
    try {
        const credentials = await authenticationClient.getTwoLeggedToken(clientId, clientSecret, [Scopes.ViewablesRead]);
        const downloadInfo = await modelDerivativeClient.getDerivativeUrl(derivativeUrn, urn, { accessToken: credentials.access_token });
        const response = await axios.get(downloadInfo.url, { responseType: 'arraybuffer', decompress: false });
        return response.data;
    } catch (error) {
        if (axios.isAxiosError(error)) {
            throw new Error(`Could not download derivative ${derivativeUrn}: ${error.message}`);
        } else {
            throw error;
        }
    }
}

async function getSvfDerivatives(urn, clientId, clientSecret) {
    const authenticationClient = new AuthenticationClient(SdkManagerBuilder.create().build());
    const modelDerivativeClient = new ModelDerivativeClient();
    const credentials = await authenticationClient.getTwoLeggedToken(clientId, clientSecret, [Scopes.ViewablesRead]);
    const manifest = await modelDerivativeClient.getManifest(urn, { accessToken: credentials.access_token });
    const derivatives = [];
    function traverse(derivative) {
        if (derivative.type === 'resource' && derivative.role === 'graphics' && derivative.mime === 'application/autodesk-svf') {
            derivatives.push(derivative);
        }
        if (derivative.children) {
            for (const child of derivative.children) {
                traverse(child);
            }
        }
    }
    for (const derivative of manifest.derivatives) {
        if (derivative.children) {
            for (const child of derivative.children) {
                traverse(child);
            }
        }
    }
    return derivatives;
}

module.exports = {
    downloadDerivative,
    getSvfDerivatives
};