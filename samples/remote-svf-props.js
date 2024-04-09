/*
 * Example: parsing object properties for all viewables in a Model Derivative URN.
 * Usage:
 *     export APS_CLIENT_ID=<your client id>
 *     export APS_CLIENT_SECRET=<your client secret>
 *     node remote-svf-props.js <your model urn>
 */

const { getSvfDerivatives } = require('./shared.js');
const { SvfReader, TwoLeggedAuthenticationProvider } = require('..');

const { APS_CLIENT_ID, APS_CLIENT_SECRET } = process.env;

async function run(urn) {
    const derivatives = await getSvfDerivatives(urn, APS_CLIENT_ID, APS_CLIENT_SECRET);
    const authenticationProvider = new TwoLeggedAuthenticationProvider(APS_CLIENT_ID, APS_CLIENT_SECRET);
    for (const derivative of derivatives) {
        const reader = await SvfReader.FromDerivativeService(urn, derivative.guid, authenticationProvider);
        const propdb = await reader.getPropertyDb();
        const props = propdb.getProperties(1);
        for (const name of Object.keys(props)) {
            console.log(`${name}: ${props[name]}`);
        }
        console.log(`Children: ${propdb.getChildren(1).join(',')}`);
    }
}

run(process.argv[2]);
