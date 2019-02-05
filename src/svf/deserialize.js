const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const Zip = require('node-zip');

const { FragmentReader } = require('./fragment-reader');
const { GeometryReader } = require('./geometry-reader');
const { MeshReader } = require('./mesh-reader');
const { MaterialReader } = require('./material-reader');

const BaseUrl = 'https://developer.api.autodesk.com';

async function getManifest(urn, token) {
    const res = await fetch(`${BaseUrl}/modelderivative/v2/designdata/${urn}/manifest`, {
        compress: true,
        headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.json();
}

async function getDerivative(urn, token) {
    const res = await fetch(`${BaseUrl}/derivativeservice/v2/derivatives/${urn}`, {
        compress: true,
        headers: { 'Authorization': 'Bearer ' + token }
    });
    return res.buffer();
}

async function getViewable(urn, token, guid) {
    const manifest = await getManifest(urn, token);
    function traverse(node, callback) {
        callback(node);
        if (node.derivatives) {
            for (const child of node.derivatives) {
                traverse(child, callback);
            }
        } else if (node.children) {
            for (const child of node.children) {
                traverse(child, callback);
            }
        }
    }

    let node = null;
    traverse(manifest, function(n) { if (n.guid === guid) node = n; });
    if (!node) {
        return null;
    }

    const url = decodeURIComponent(node.urn);
    const rootFilename = url.slice(url.lastIndexOf('/') + 1);
    const basePath = url.slice(0, url.lastIndexOf('/') + 1);
    const localPath = basePath.slice(basePath.indexOf('/') + 1).replace(/^output\//, '');
    const buffer = await getDerivative(url, token);
    const archive = new Zip(buffer, { checkCRC32: true, base64: false });
    return {
        url, rootFilename, basePath, localPath,
        manifest: JSON.parse(archive.files['manifest.json'].asText()),
        metadata: JSON.parse(archive.files['metadata.json'].asText())
    };
}

async function parseFragments(uri, token) {
    const buffer = await getDerivative(uri, token);
    const reader = new FragmentReader(buffer);
    return reader.fragments;
}

async function parseGeometries(uri, token) {
    const buffer = await getDerivative(uri, token);
    const reader = new GeometryReader(buffer);
    return reader.geometries;
}

async function parseMeshes(uri, token) {
    const buffer = await getDerivative(uri, token);
    const reader = new MeshReader(buffer);
    return reader.meshes;
}

async function parseMaterials(uri, token) {
    const buffer = await getDerivative(uri, token);
    const reader = new MaterialReader(buffer);
    return reader.materials;
}

async function deserialize(urn, token, guid) {
    const svf = await getViewable(urn, token, guid);

    let manifest = svf.manifest;
    let metadata = svf.metadata;
    let materials = null;
    let fragments = null;
    let geometries = null;
    let meshpacks = [];

    for (const asset of manifest.assets) {
        switch (asset.type) {
            case 'Autodesk.CloudPlatform.PropertyAttributes':
            case 'Autodesk.CloudPlatform.PropertyValues':
            case 'Autodesk.CloudPlatform.PropertyIDs':
            case 'Autodesk.CloudPlatform.PropertyViewables':
            case 'Autodesk.CloudPlatform.PropertyOffsets':
            case 'Autodesk.CloudPlatform.PropertyAVs':
            case 'Autodesk.CloudPlatform.PropertyRCVs':
                // TODO: parse property db
                break;
            case 'Autodesk.CloudPlatform.InstanceTree':
                // TODO: parse instance tree
                break;
            case 'Autodesk.CloudPlatform.FragmentList':
                fragments = await parseFragments(svf.basePath + asset.URI, token);
                break;
            case 'Autodesk.CloudPlatform.GeometryMetadataList':
                geometries = await parseGeometries(svf.basePath + asset.URI, token);
                break;
            case 'Autodesk.CloudPlatform.PackFile':
                const typeset = manifest.typesets[asset.typeset];
                if (typeset.types[0].class === 'Autodesk.CloudPlatform.Geometry') {
                    const meshpack = await parseMeshes(svf.basePath + asset.URI, token);
                    meshpacks.push(meshpack);
                }
                break;
            case 'ProteinMaterials':
                materials = await parseMaterials(svf.basePath + asset.URI, token);
                break;
        }
    }

    return { manifest, metadata, materials, fragments, geometries, meshpacks };
}

module.exports = {
    deserialize
};