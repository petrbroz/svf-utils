const { SdkManagerBuilder } = require('@aps_sdk/autodesk-sdkmanager');
const { AuthenticationClient, Scopes } = require('@aps_sdk/authentication');
const { ModelDerivativeClient } = require('@aps_sdk/model-derivative');
const { TwoLeggedAuthenticationProvider, BasicAuthenticationProvider } = require('..');

async function getSvfDerivatives(urn, clientId, clientSecret, region) {
    const authenticationClient = new AuthenticationClient(SdkManagerBuilder.create().build());
    const modelDerivativeClient = new ModelDerivativeClient();
    const credentials = await authenticationClient.getTwoLeggedToken(clientId, clientSecret, [Scopes.ViewablesRead]);
    const manifest = await modelDerivativeClient.getManifest(urn, { accessToken: credentials.access_token, region });
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

function initializeAuthenticationProvider() {
    if (process.env.APS_CLIENT_ID || process.env.APS_CLIENT_SECRET) {
        return new TwoLeggedAuthenticationProvider(process.env.APS_CLIENT_ID, process.env.APS_CLIENT_SECRET);
    } else if (process.env.APS_ACCESS_TOKEN) {
        return new BasicAuthenticationProvider(process.env.APS_ACCESS_TOKEN);
    } else {
        throw new Error('Please set APS_CLIENT_ID and APS_CLIENT_SECRET environment variables, or APS_ACCESS_TOKEN environment variable');
    }
}

module.exports = {
    getSvfDerivatives,
    initializeAuthenticationProvider
};