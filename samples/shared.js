const axios = require('axios').default;
const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { AuthenticationClient, Scopes } = require('@aps_sdk/authentication');
const { ModelDerivativeClient } = require('@aps_sdk/model-derivative');

async function downloadDerivative(urn, derivativeUrn, clientId, clientSecret) {
    const sdkManager = SdkManagerBuilder.create().build();
    const authenticationClient = new AuthenticationClient(sdkManager);
    const modelDerivativeClient = new ModelDerivativeClient(sdkManager);
    const credentials = await authenticationClient.getTwoLeggedToken(clientId, clientSecret, [Scopes.ViewablesRead]);
    const downloadInfo = await modelDerivativeClient.getDerivativeUrl(credentials.access_token, derivativeUrn, urn);
    const response = await axios.get(downloadInfo.url, { responseType: 'arraybuffer', decompress: false });
    return response.data;
}

async function getSvfDerivatives(urn, clientId, clientSecret) {
    const sdkManager = SdkManagerBuilder.create().build();
    const authenticationClient = new AuthenticationClient(sdkManager);
    const modelDerivativeClient = new ModelDerivativeClient(sdkManager);
    const credentials = await authenticationClient.getTwoLeggedToken(clientId, clientSecret, [Scopes.ViewablesRead]);
    const manifest = await modelDerivativeClient.getManifest(credentials.access_token, urn);
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