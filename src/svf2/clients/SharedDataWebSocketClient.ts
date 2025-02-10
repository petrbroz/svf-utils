import WebSocket from 'ws';
import { gunzipSync } from 'zlib';
import { Scopes } from '@aps_sdk/authentication';
import { IAuthenticationProvider } from '../../common/authentication-provider';

export enum AssetType {
    Geometry = 'g',
    Material = 'm',
}

interface Resource {
    type: AssetType;
    hash: string;
    data: Uint8Array;
}

const HashByteLength = 20;
const HashHexLength = 40;

export class SharedDataWebSocketClient {
    protected requestedResources: number = 0;
    protected receivedResources: number = 0;
    protected lastSentAccountID: string = '';
    protected lastSentURN: string = '';
    protected lastSentAccessToken: string = '';

    public static async Connect(authenticationProvider: IAuthenticationProvider, url: string = 'wss://cdn.derivative.autodesk.com/cdnws'): Promise<SharedDataWebSocketClient> {
        return new Promise<SharedDataWebSocketClient>((resolve, reject) => {
            const ws = new WebSocket(url);
            ws.binaryType = 'arraybuffer';
            const onOpen = () => {
                detachListeners();
                resolve(new SharedDataWebSocketClient(ws, authenticationProvider));
            };
            const onError = (err: Error) => {
                detachListeners();
                reject(err);
            };
            const attachListeners = () => ws.on('open', onOpen).on('error', onError);
            const detachListeners = () => ws.off('open', onOpen).off('error', onError);
            attachListeners();
        });
    }

    protected static HashToBinary = (hash: string): Uint8Array => {
        console.assert(hash.length === HashHexLength);
        return Uint8Array.from(Buffer.from(hash, 'hex'));
    }

    protected static BinaryToHash = (arr: Uint8Array): string => {
        console.assert(arr.byteLength === HashByteLength);
        return Array.from(arr).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    protected static EncodeRequest = (type: AssetType, hashes: string[]): Uint8Array => {
        const arr = new Uint8Array(1 + hashes.length * HashByteLength);
        arr[0] = type.charCodeAt(0);
        for (const [i, hash] of hashes.entries()) {
            arr.set(SharedDataWebSocketClient.HashToBinary(hash), 1 + i * HashByteLength);
        }
        return arr;
    }

    protected static DecodeResponse = (data: ArrayBuffer): Resource[] => {
        if (data.byteLength < 4) {
            throw new Error('Invalid message length.');
        }

        const view = new DataView(data);
        const magicNumber = view.getUint32(0, true);
        if (magicNumber !== 0x314B504F) {
            throw new Error('Invalid magic number.');
        }

        const resourceType = String.fromCharCode(view.getUint32(4, true) & 0xff);
        const numResources = view.getUint32(8, true);
        const offsets = new Uint32Array(data, 12, numResources);
        const content = new Uint8Array(data, 12 + offsets.byteLength);
        const resources: Resource[] = [];
        for (let i = 0; i < numResources; i++) {
            const start = offsets[i];
            const end = ((i < offsets.length - 1) ? offsets[i + 1] : content.byteLength);
            const hash = SharedDataWebSocketClient.BinaryToHash(content.slice(start, start + HashByteLength));
            const data = content.slice(start + HashByteLength, end);
            if (resourceType === 'e') {
                // The first four bytes are a HTTP-statuscode-like error code. It doesn't add anything to the message so we ignore it.
                // See https://git.autodesk.com/A360/platform-ds-ss/blob/6c439e82f3138eed3935b68096d2d980ffe95616/src/ws-server/ws-server.js#L310
                const errorMessage = new TextDecoder().decode(data.subarray(4));
                throw new Error(`Error from WebSocket server: ${errorMessage}`);
            } else {
                resources.push({ type: resourceType as AssetType, hash: hash, data });
            }
        }
        return resources;
    }

    constructor(protected readonly ws: WebSocket, protected readonly authenticationProvider: IAuthenticationProvider) {}

    close() {
        this.ws.close();
    }

    async getAssets(urn: string, account: string, type: AssetType, hashes: string[]): Promise<Map<string, Buffer>> {
        const accessToken = await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
        const resources = await this.requestResources(urn, account, type, hashes, accessToken);
        const assets = new Map<string, Buffer>();
        for (const { hash, data } of resources) {
            assets.set(hash, gunzipSync(Buffer.from(data.buffer)));
        }
        return assets;
    }

    protected requestResources(urn: string, accountID: string, type: AssetType, hashes: string[], accessToken: string): Promise<Resource[]> {
        if (this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket connection is not open.');
        }
        if (this.receivedResources < this.requestedResources) {
            throw new Error('Previous requests are still being processed.');
        }
        this.requestedResources += hashes.length;

        if (this.lastSentAccessToken !== accessToken) {
            this.ws.send(`/headers/{"Authorization":"Bearer ${accessToken}"}`);
            this.ws.send(`/options/{"batch_responses":true,"report_errors":true}`);
            this.lastSentAccessToken = accessToken;
        }
        if (this.lastSentURN !== urn) {
            this.ws.send(`/auth/${urn}`);
            this.lastSentURN = urn;
        }
        if (this.lastSentAccountID !== accountID) {
            this.ws.send(`/account_id/${accountID}`);
            this.lastSentAccountID = accountID;
        }

        return new Promise<Resource[]>(async (resolve, reject) => {
            const results: Resource[] = [];
            const onMessage = (data: WebSocket.Data) => {
                try {
                    const resources = SharedDataWebSocketClient.DecodeResponse(data as ArrayBuffer);
                    results.push(...resources);
                    this.receivedResources += resources.length;
                    if (this.receivedResources === this.requestedResources) {
                        detachListeners();
                        resolve(results);
                    }
                } catch (err) {
                    detachListeners();
                    reject(err);
                }
            };
            const onError = (err: Error) => {
                detachListeners();
                reject(new Error(`WebSocket connection error: ${err.message}.`));
            };
            const onClose = (code: number, reason: Buffer) => {
                detachListeners();
                reject(new Error(`WebSocket connection closed with code ${code}: ${reason.toString()}.`));
            };
            const attachListeners = () => this.ws.on('message', onMessage).on('error', onError).on('close', onClose);
            const detachListeners = () => this.ws.off('message', onMessage).off('error', onError).off('close', onClose);
            attachListeners();
            const requestBuffer = SharedDataWebSocketClient.EncodeRequest(type, hashes);
            this.ws.send(requestBuffer);
        });
    }
}