const fs = require('fs');
const path = require('path');
const express = require('express');
const fetch = require('node-fetch');

const { deserialize } = require('./src/svf/deserialize');
const { serialize } = require('./src/gltf/serialize')

const ForgeUrl = 'https://developer.api.autodesk.com';

let app = express();

function findViewables(manifest) {
    function traverse(node, callback) {
        callback(node);
        node.derivatives && node.derivatives.forEach(child => traverse(child, callback));
        node.children && node.children.forEach(child => traverse(child, callback));
    }

    let viewables = [];
    traverse(manifest, function(node) { if (node.mime === 'application/autodesk-svf') viewables.push(node.guid); });
    return viewables;
}

// GET /:urn
// Lists GUIDs of all 3D viewables in an URN.
// Requires "Authorization" header with Forge access token.
app.get('/:urn', async function(req, res) {
    try {
        const { urn } = req.params;
        const url = `${ForgeUrl}/modelderivative/v2/designdata/${urn}/manifest`;
        const response = await fetch(url, { headers: { Authorization: req.headers.authorization }  });
        const manifest = await response.json();
        res.json(findViewables(manifest));
    } catch(ex) {
        res.status(500).send(ex);
    }
});

// Intercepts all requests to /:urn/:guid/*,
// triggering SVF-to-GLTF translation if the output is not yet available.
app.use('/:urn/:guid', async function(req, res, next) {
    try {
        const { urn, guid } = req.params;
        const folder = path.join(__dirname, 'cache', urn, guid);
        if (!fs.existsSync(folder)) {
            const token = req.headers.authorization.replace('Bearer ', '');
            const model = await deserialize(urn, token, guid);
            fs.mkdirSync(path.dirname(folder));
            fs.mkdirSync(folder);
            serialize(model, path.join(folder, 'output'));
        }
        next();
    } catch(ex) {
        res.status(500).send(ex);
    }
});

// GET /:urn/:guid
// Lists all files available for a 3D viewable GUID.
// Requires "Authorization" header with Forge access token.
app.get('/:urn/:guid', function(req, res) {
    const { urn, guid } = req.params;
    const folder = path.join(__dirname, 'cache', urn, guid);
    res.json(fs.readdirSync(folder));
});

// GET /:urn/:guid/:resource
// Returns raw data of a specific resource of a 3D viewable GUID.
// Requires "Authorization" header with Forge access token.
app.get('/:urn/:guid/:resource', function(req, res) {
    const { urn, guid, resource } = req.params;
    const folder = path.join(__dirname, 'cache', urn, guid);
    const file = path.join(folder, resource);
    if (fs.existsSync(file)) {
        res.sendFile(file);
    } else {
        res.status(404).end();
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => { console.log(`Server listening on port ${port}`); });