export class Vec3 {
    constructor(public x: number = 0.0, public y: number = 0.0, public z: number = 0.0) {}
}

export class Box3 {
    public min: Vec3;
    public max: Vec3;

    constructor(min?: Vec3, max?: Vec3) {
        this.min = min || new Vec3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
        this.max = max || new Vec3(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE);
    }

    public addBox(box: Box3): void {
        this.min.x = Math.min(this.min.x, box.min.x);
        this.min.y = Math.min(this.min.y, box.min.y);
        this.min.z = Math.min(this.min.z, box.min.z);
        this.max.x = Math.max(this.max.x, box.max.x);
        this.max.y = Math.max(this.max.y, box.max.y);
        this.max.z = Math.max(this.max.z, box.max.z);
    }

    public addPoint(point: Vec3): void {
        this.min.x = Math.min(this.min.x, point.x);
        this.min.y = Math.min(this.min.y, point.y);
        this.min.z = Math.min(this.min.z, point.z);
        this.max.x = Math.max(this.max.x, point.x);
        this.max.y = Math.max(this.max.y, point.y);
        this.max.z = Math.max(this.max.z, point.z);
    }

    public get empty(): boolean {
        return this.min.x >= this.max.x || this.min.y >= this.max.y || this.min.z >= this.max.z;
    }

    public getCenter(): Vec3 {
        return new Vec3(
            0.5 * (this.min.x + this.max.x),
            0.5 * (this.min.y + this.max.y),
            0.5 * (this.min.z + this.max.z)
        );
    }
}
