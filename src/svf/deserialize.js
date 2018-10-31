const fs = require('fs');
const path = require('path');
const Zip = require('node-zip');

const { FragmentReader } = require('./fragment-reader');
const { GeometryReader } = require('./geometry-reader');
const { MeshReader } = require('./mesh-reader');
const { MaterialReader } = require('./material-reader');

function getAsset(ownerPath, assetPath) {
    return path.join(path.dirname(ownerPath), assetPath);
}

function parseFragments(uri) {
    const reader = new FragmentReader(fs.readFileSync(uri));
    return reader.fragments;
}

function parseGeometries(uri) {
    const reader = new GeometryReader(fs.readFileSync(uri));
    return reader.geometries;
}

function parseMeshes(uri) {
    const reader = new MeshReader(fs.readFileSync(uri));
    return reader.meshes;
}

function parseMaterials(uri) {
    const reader = new MaterialReader(fs.readFileSync(uri));
    return reader.materials;
}

function deserialize(filename) {
    const buffer = fs.readFileSync(filename);
    const svf = new Zip(buffer, { checkCRC32: true, base64: false });
    const manifest = JSON.parse(svf.files['manifest.json'].asText());
    const metadata = JSON.parse(svf.files['metadata.json'].asText());
    let result = {
        metadata,
        fragments: null,
        geometries: null,
        meshpacks: []
    };
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
                result.fragments = parseFragments(getAsset(filename, asset.URI));
                break;
            case 'Autodesk.CloudPlatform.GeometryMetadataList':
                result.geometries = parseGeometries(getAsset(filename, asset.URI));
                break;
            case 'Autodesk.CloudPlatform.PackFile':
                const typeset = manifest.typesets[asset.typeset];
                if (typeset.types[0].class === 'Autodesk.CloudPlatform.Geometry') {
                    result.meshpacks.push(parseMeshes(getAsset(filename, asset.URI)));
                }
                break;
            case 'ProteinMaterials':
                result.materials = parseMaterials(getAsset(filename, asset.URI));
                break;
        }
    }
    return result;
}

module.exports = {
    deserialize
};