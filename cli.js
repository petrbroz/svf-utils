const path = require('path');
const fs = require('fs');
const program = require('commander');
const { AuthenticationClient } = require('forge-server-utils');

const { version } = require('./package.json');
const { deserialize } = require('./src/readers/svf');
const { serialize } = require('./src/writers/gltf');
const { getManifest, traverseManifest } = require('./src/helpers/forge');

async function convertToGltf(urn, guid, token, folder) {
    console.log('Converting to gltf');

    const outputFolder = path.join(folder, 'gltf');
    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);

    const model = await deserialize(urn, token, guid, console.log);
    serialize(model, path.join(outputFolder, 'output'));
    fs.writeFileSync(path.join(outputFolder, 'props.db'), model.propertydb); // TODO: store property db just once per URN
}

async function convertViewable(urn, guid, token, folder, format) {
    console.log('Viewable GUID', guid);

    const viewableFolder = path.join(folder, guid);
    if (!fs.existsSync(viewableFolder)) fs.mkdirSync(viewableFolder);

    switch (format) {
        case 'gltf':
            await convertToGltf(urn, guid, token, viewableFolder)
            break;
        default:
            console.warn('Output type not supported.');
            break;
    }
}

async function convertUrn(urn, guid, token, folder, format) {
    console.log('URN', urn);

    const outputFolder = path.resolve(__dirname, folder);
    if (!fs.existsSync(outputFolder)) fs.mkdirSync(outputFolder);
    const urnFolder = path.join(outputFolder, urn);
    if (!fs.existsSync(urnFolder)) fs.mkdirSync(urnFolder);

    if (guid) {
        await convertViewable(urn, guid, token, urnFolder, format);
    } else {
        const manifest = await getManifest(urn, token);
        const guids = [];
        traverseManifest(manifest, function(node) {
            if (node.mime === 'application/autodesk-svf') {
                guids.push(node.guid);
            }
        });
        for (const guid of guids) {
            await convertViewable(urn, guid, token, urnFolder, format);
        }
    }
}

program
    .version(version, '-v, --version')
    .option('-o, --output-folder [folder]', 'output folder', '.')
    .option('-t, --output-type [type]', 'output file format (gltf)', 'gltf')
    .arguments('<urn> [guid]')
    .action(async function(urn, guid) {
        const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;
        if (!FORGE_CLIENT_ID || !FORGE_CLIENT_SECRET) {
            console.warn('FORGE_CLIENT_ID or FORGE_CLIENT_SECRET env. variables missing.');
            return;
        }
        try {
            const authClient = new AuthenticationClient(FORGE_CLIENT_ID, FORGE_CLIENT_SECRET);
            const token = await authClient.authenticate(['viewables:read']);
            await convertUrn(urn, guid, token.access_token, program.outputFolder, program.outputType);
        } catch(err) {
            console.error(err);
        }
    })
    .parse(process.argv);

if (program.args.length === 0) {
    program.help();
}