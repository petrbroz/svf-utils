import WebSocket from 'ws';
import { gunzipSync } from 'zlib';
import { IAuthenticationProvider } from '../../common/authentication-provider';
import { Scopes } from '@aps_sdk/authentication';

export enum ResourceType {
    Geometry = 'g',
    Material = 'm',
}

export interface Resource {
    type: ResourceType;
    hash: string;
    data: Uint8Array;
}

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
            const attachListeners = () => {
                ws.on('open', onOpen);
                ws.on('error', onError);
            };
            const detachListeners = () => {
                ws.off('open', onOpen);
                ws.off('error', onError);
            }
            attachListeners();
        });
    }

    protected static HexToBinary = (hex: string): Uint8Array => {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i ++) {
            bytes[i] = parseInt(hex.substring(i * 2, (i + 1) * 2), 16);
        }
        return bytes;
    }

    protected static BinaryToHex = (binary: Uint8Array): string => {
        return Array.from(binary).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }

    protected static EncodeRequest = (type: ResourceType, hashes: string[]): Uint8Array => {
        const byteLength = 1 + hashes.reduce((acc, hash) => acc + hash.length / 2, 0);
        const buffer = new Uint8Array(byteLength);
        buffer[0] = type.charCodeAt(0);
        let offset = 1;
        for (const hash of hashes) {
            const binary = SharedDataWebSocketClient.HexToBinary(hash);
            buffer.set(binary, offset);
            offset += binary.byteLength;
        }
        return buffer;
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
        const content = new Uint8Array(data, 12 + numResources * 4);
        const resources: Resource[] = [];
        for (let i = 0; i < numResources; i++) {
            const start = offsets[i];
            const end = ((i < offsets.length - 1) ? offsets[i + 1] : content.byteLength);
            const hash = SharedDataWebSocketClient.BinaryToHex(content.slice(start, start + 20));
            const data = content.slice(start + 20, end);
            if (resourceType === 'e') {
                // The first four bytes are a HTTP-statuscode-like error code. It doesn't add anything to the message so we ignore it.
                // See https://git.autodesk.com/A360/platform-ds-ss/blob/6c439e82f3138eed3935b68096d2d980ffe95616/src/ws-server/ws-server.js#L310
                const errorMessage = new TextDecoder().decode(data.subarray(4));
                throw new Error(`Error from WebSocket server: ${errorMessage}`);
            } else {
                resources.push({ type: resourceType as ResourceType, hash: hash, data });
            }
        }
        return resources;
    }

    constructor(protected readonly ws: WebSocket, protected readonly authenticationProvider: IAuthenticationProvider) {}

    close() {
        this.ws.close();
    }

    async getAsset(urn: string, assetUrn: string): Promise<Buffer> {
        const [_, account, type, hash] = assetUrn.split('/');
        const accessToken = this.lastSentAccessToken || await this.authenticationProvider.getToken([Scopes.ViewablesRead]);
        const resources = await this.requestResources(urn, account, type as ResourceType, [hash], accessToken);
        const buffer = Buffer.from(resources[0].data.buffer);
        return type === ResourceType.Material ? gunzipSync(buffer) : buffer;
    }

    // async getAssets(urn: string, assetUrns: string[]): Promise<Buffer[]> {
    //     const assetUrnTokens = assetUrn.split('/');
    //     const account = assetUrnTokens[1];
    //     const type = assetUrnTokens[2];
    //     const hash = assetUrnTokens[3];
    // }
    
    protected requestResources(urn: string, accountID: string, type: ResourceType, hashes: string[], accessToken: string): Promise<Resource[]> {
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
            const attachListeners = () => {
                this.ws.on('message', onMessage);
                this.ws.on('error', onError);
                this.ws.on('close', onClose);
            };
            const detachListeners = () => {
                this.ws.off('message', onMessage);
                this.ws.off('error', onError);
                this.ws.off('close', onClose);
            }
            attachListeners();
            const requestBuffer = SharedDataWebSocketClient.EncodeRequest(type, hashes);
            this.ws.send(requestBuffer);
        });
    }
}