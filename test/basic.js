const path = require('path');
const { deserialize } = require('../lib/svf');
const { serialize } = require('../lib/gltf');

const {
    FORGE_CLIENT_ID,
    FORGE_CLIENT_SECRET,
    FORGE_MODEL_URN,
    FORGE_VIEWABLE_GUID
} = process.env;

async function test(urn, guid) {
    const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
    try {
        const svf = await deserialize(urn, guid, auth);
        await serialize(svf, path.join(__dirname, 'tmp', FORGE_MODEL_URN, FORGE_VIEWABLE_GUID));
        console.log(svf);
    } catch(err) {
        console.error(err);
    }
}

test(FORGE_MODEL_URN, FORGE_VIEWABLE_GUID);
