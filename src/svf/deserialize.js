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

async function getViewable(urn, token, guid) {
    const manifest = await getManifest(urn, token);
    let node = null;
    traverseManifest(manifest, function(n) { if (n.guid === guid) node = n; });
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

async function getPropertyDatabase(urn, token) {
    const manifest = await getManifest(urn, token);
    let node = null;
    traverseManifest(manifest, function(n) { if (n.mime === 'application/autodesk-db') node = n; });
    if (!node) {
        return null;
    }

    const url = decodeURIComponent(node.urn);
    const buffer = await getDerivative(url, token);
    return buffer;
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

async function deserialize(urn, token, guid, log) {
    log('Downloading viewable manifest and metadata.');
    const svf = await getViewable(urn, token, guid);
    log('Downloading property database.');
    const propertydb = await getPropertyDatabase(urn, token);

    let manifest = svf.manifest;
    let metadata = svf.metata;
    let materials = null;
    let fragments = null;
    let geometries = null;
    let meshpacks = [];

    for (const asset of manifest.assets) {
        switch (asset.type) {
            case 'Autodesk.CloudPlatform.InstanceTree':
                // TODO: parse instance tree
                break;
            case 'Autodesk.CloudPlatform.FragmentList':
                log(`Parsing fragments (${asset.URI}).`);
                fragments = await parseFragments(svf.basePath + asset.URI, token);
                break;
            case 'Autodesk.CloudPlatform.GeometryMetadataList':
                log(`Parsing geometries (${asset.URI}).`);
                geometries = await parseGeometries(svf.basePath + asset.URI, token);
                break;
            case 'Autodesk.CloudPlatform.PackFile':
                const typeset = manifest.typesets[asset.typeset];
                if (typeset.types[0].class === 'Autodesk.CloudPlatform.Geometry') {
                    log(`Parsing meshes (${asset.URI}).`);
                    const meshpack = await parseMeshes(svf.basePath + asset.URI, token);
                    meshpacks.push(meshpack);
                }
                break;
            case 'ProteinMaterials':
                log(`Parsing materials (${asset.URI}).`);
                materials = await parseMaterials(svf.basePath + asset.URI, token);
                break;
        }
    }

    log(`Deserialization complete.`);
    return { manifest, metadata, materials, fragments, geometries, meshpacks, propertydb };
}

module.exports = {
    deserialize
};