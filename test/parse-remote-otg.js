const { OtgReader } = require('..');

const { FORGE_CLIENT_ID, FORGE_CLIENT_SECRET } = process.env;

async function run(urn, guid) {
    try {
        const auth = { client_id: FORGE_CLIENT_ID, client_secret: FORGE_CLIENT_SECRET };
        const reader = await OtgReader.FromDerivativeService(urn, guid, auth);
        const otg = await reader.read();
        console.log(otg);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
    console.log('Done!');
}

run(process.argv[2], process.argv[3]);
