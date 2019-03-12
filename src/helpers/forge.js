const _fetch = require('node-fetch');

const BaseUrl = 'https://developer.api.autodesk.com';

async function getManifest(urn, token) {
    const res = await _fetch(`${BaseUrl}/modelderivative/v2/designdata/${urn}/manifest`, {
        compress: true,
        headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.json();
}

async function getDerivative(urn, token) {
    const res = await _fetch(`${BaseUrl}/derivativeservice/v2/derivatives/${urn}`, {
        compress: true,
        headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.buffer();
}

function traverseManifest(node, callback) {
    callback(node);
    if (node.derivatives) {
        for (const child of node.derivatives) {
            traverseManifest(child, callback);
        }
    } else if (node.children) {
        for (const child of node.children) {
            traverseManifest(child, callback);
        }
    }
}

module.exports = {
    getManifest,
    getDerivative,
    traverseManifest
};