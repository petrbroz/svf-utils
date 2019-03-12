# forge-extract

Prototype of a simple SVF-to-glTF translator.

## Usage

### Server

- install npm dependencies: `npm install`
- run the server: `npm start`
- list all 3D viewables in an URN: `curl -X GET http://localhost:3000/<urn> -H 'Authorization: Bearer <access token>'`
- list all translations of a 3D viewable: `curl -X GET http://localhost:3000/<urn>/<guid> -H 'Authorization: Bearer <access token>'`
- get the content of a translation output: `curl -X GET http://localhost:3000/<urn>/<guid>/<resource> -H 'Authorization: Bearer <access token>'`

### Command line

- install npm dependencies: `npm install`
- run the command line script without parameters for usage info: `node cli.js`
- run the command line script with parameters: `FORGE_ACCESS_TOKEN=<token> node cli.js --output-folder=test <urn>`