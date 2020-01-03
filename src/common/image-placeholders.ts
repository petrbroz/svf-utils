import * as path from 'path';
import * as fse from 'fs-extra';

const ResFolder = path.join(__dirname, '..', '..', 'res');

export class ImagePlaceholder {
    private static _jpg: Buffer | undefined;
    private static _png: Buffer | undefined;
    private static _bmp: Buffer | undefined;
    private static _gif: Buffer | undefined;

    private constructor() {}

    public static get JPG(): Buffer {
        if (!this._jpg) {
            this._jpg = fse.readFileSync(path.join(ResFolder, 'placeholder.jpg'));
        }
        return this._jpg;
    }

    public static get PNG(): Buffer {
        if (!this._png) {
            this._png = fse.readFileSync(path.join(ResFolder, 'placeholder.png'));
        }
        return this._png;
    }

    public static get BMP(): Buffer {
        if (!this._bmp) {
            this._bmp = fse.readFileSync(path.join(ResFolder, 'placeholder.bmp'));
        }
        return this._bmp;
    }

    public static get GIF(): Buffer {
        if (!this._gif) {
            this._gif = fse.readFileSync(path.join(ResFolder, 'placeholder.gif'));
        }
        return this._gif;
    }
}
