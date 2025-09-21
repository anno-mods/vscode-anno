export class Vector {
  x: number = 0;
  y: number = 0;
  z: number = 0;

  static readonly zero = new Vector(0, 0, 0);
  static readonly one = new Vector(1, 1, 1);

  /** create from x, y, z */
  constructor (x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** create from [... offset, offset + 1, offset + 2, ...] */
  public static fromArray(array: ArrayLike<number>, offset: number = 0) {
    if (!array || array.length < (offset + 1) * 3) {
      return undefined;
    }
    return new Vector(
      array[offset * 3 + 0],
      array[offset * 3 + 1],
      array[offset * 3 + 2]
    );
  }

  /** create from string object */
  public static parse(obj: { x: string, y: string, z: string } | undefined) {
    if (!obj || !obj.x || !obj.y || !obj.z) {
      return undefined;
    }
    return new Vector(parseFloat(obj.x), parseFloat(obj.y), parseFloat(obj.z));
  }

  /** { xf: 0.000000, yf, zf } */
  public toFixedF(fixed: number = 6) {
    return { xf: this.x.toFixed(fixed), yf: this.y.toFixed(fixed), zf: this.z.toFixed(fixed) };
  }

  /** { xf: 0, yf: 1.5, zf } */
  public toF() {
    return { xf: this.x, yf: this.y, zf: this.z };
  }

  /** convert to 2D x,z vector */
  public toVector2() {
    return new Vector2(this.x, this.z);
  }

  /** return new Vector with values of b added */
  public add(b: Vector) {
    return new Vector(this.x + b.x, this.y + b.y, this.z + b.z); 
  }

  /** return new Vector with values of b subtracted */
  public sub(b: Vector) {
    return new Vector(this.x - b.x, this.y - b.y, this.z - b.z); 
  }

  /** return new Vector with values divided by b */
  public div(b: number) {
    return new Vector(this.x / b, this.y / b, this.z / b); 
  }

  /** return new Vector with values multiplied by b */
  public mul(b: number | Vector) {
    if (typeof b === 'number') {
      return new Vector(this.x * b, this.y * b, this.z * b); 
    }
    return new Vector(this.x * b.x, this.y * b.y, this.z * b.z); 
  }

  /** return new Vector with smallest values of this and b */
  public down(b: Vector) {
    return new Vector(Math.min(this.x, b.x), Math.min(this.y, b.y), Math.min(this.z, b.z));
  }
  
  /** return new Vector with largest values of this and b */
  public up(b: Vector) {
    return new Vector(Math.max(this.x, b.x), Math.max(this.y, b.y), Math.max(this.z, b.z));
  }

  /** return new Vector with rounded values */
  public round(factor: number = 1) {
    return new Vector(Math.round(this.x * factor) / factor, Math.round(this.y * factor) / factor, Math.round(this.z * factor) / factor);
  }

  /** return rotated new Vector */
  public rotate(quat: Quaternion) {
    const quatR = new Quaternion(0, this.x, this.y, this.z);
    const quatConjugate = new Quaternion(quat.x, -1 * quat.y, -1 * quat.z, -1 * quat.w);
    const result = quat.mul(quatR).mul(quatConjugate);
    return new Vector(-result.y, -result.z, result.w);
  }
}

export class Vector2 {
  x: number = 0;
  z: number = 0;

  static readonly zero = new Vector2(0, 0);
  static readonly one = new Vector2(1, 1);

  /** create from x, z */
  constructor (x: number, z: number) {
    this.x = x;
    this.z = z;
  }

  /** create from array with 2 elements */
  public static fromArray(array: ArrayLike<number>) {
    if (!array || array.length < 2) {
      return undefined;
    }
    return new Vector2(
      array[0],
      array[1]
    );
  }

  /** { xf: 0.000000, zf } */
  public toFixedF(fixed: number = 6) {
    return { xf: this.x.toFixed(fixed), zf: this.z.toFixed(fixed) };
  }

  /** { xf: 1, zf: 1.5 } */
  public toF() {
    return { xf: this.x, zf: this.z };
  }
  
  /** return new Vector with smallest values of this and b */
  public down(b: Vector2) {
    return new Vector2(Math.min(this.x, b.x), Math.min(this.z, b.z));
  }
  
  /** return new Vector with largest values of this and b */
  public up(b: Vector2) {
    return new Vector2(Math.max(this.x, b.x), Math.max(this.z, b.z));
  }

  /** return new Vector with rounded values */
  public round(factor: number = 1) {
    return new Vector2(Math.round(this.x * factor) / factor, Math.round(this.z * factor) / factor);
  }
  
  /** return new Vector with rounded up values in both sign directions */
  public aceil(factor: number = 1) {
    return new Vector2(
      Math.ceil(Math.sign(this.x) * this.x * factor - 0.0000001) / factor * Math.sign(this.x), 
      Math.ceil(Math.sign(this.z) * this.z * factor - 0.0000001) / factor * Math.sign(this.z));
  }

  public compare(that: Vector2) {
    if (this.x !== that.x) {
      return this.x - that.x;
    }
    if (this.z !== that.z) {
      return this.z - that.z;
    }
    return 0;
  }
}

export class Quaternion {
  x: number = 0;
  y: number = 0;
  z: number = 0;
  w: number = 1;

  static readonly default = new Quaternion(0, 0, 0, 1);

  /** either x, y, z, w or array with 4 elements */
  constructor (x: number, y: number, z: number, w: number) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /** create from array with 4 elements */
  public static fromArray(array: ArrayLike<number>) {
    if (!array || array.length < 4) {
      return undefined;
    }
    return new Quaternion(
      array[0],
      array[1],
      array[2],
      array[3]
    );
  }

  /** { xf: 0.000000, yf, zf, wf } */
  public toFixedF(fixed: number = 6) {
    return { xf: this.x.toFixed(fixed), yf: this.y.toFixed(fixed), zf: this.z.toFixed(fixed), wf: this.w.toFixed(fixed) };
  }

  /** { xf: 0, yf: 1.5, zf, wf } */
  public toF() {
    return { xf: this.x, yf: this.y, zf: this.z, wf: this.w };
  }

  /** return new Quaternion with rounded values */
  public round(factor: number = 1) {
    return new Quaternion(Math.round(this.x * factor) / factor, Math.round(this.y * factor) / factor, Math.round(this.z * factor) / factor, Math.round(this.w * factor) / factor);
  }

  /** return new multiplied Quaternion */
  public mul(that: Quaternion) {
    return new Quaternion(
      that.x*this.x-that.y*this.y-that.z*this.z-that.w*this.w,
      that.x*this.y+that.y*this.x-that.z*this.w+that.w*this.z,
      that.x*this.z+that.y*this.w+that.z*this.x-that.w*this.y,
      that.x*this.w-that.y*this.z+that.z*this.y+that.w*this.x);
  }
}

export class Box {
  name: string = "";
  center: Vector = Vector.zero;
  size: Vector = Vector.zero;
  rotation: Quaternion = Quaternion.default;

  public static fromMinMax(name: string, min: Vector, max: Vector, rotation: Quaternion = Quaternion.default) {
    let box = new Box();
    box.center = min.add(max).div(2);
    box.size = max.sub(min);
    box.name = name;
    box.rotation = rotation;
    return box;
  }
}

export class Edge2 {
  a: Vector2 = Vector2.zero;
  b: Vector2 = Vector2.zero;

  public constructor (a: Vector2, b: Vector2) {
    if (a.compare(b) > 0) {
      this.a = b;
      this.b = a;
    }
    else {
      this.a = a;
      this.b = b;
    }
  }

  public compare(that: Edge2) {
    const compareA = this.a.compare(that.a);
    if (compareA) {
      return compareA;
    }
    const compareB = this.b.compare(that.b);
    if (compareB) {
      return compareB;
    }
    return 0;
  }
}

export function sortVectorsByOutline(vertices: ArrayLike<Vector2>, indices: ArrayLike<number>) {
  let edges: Edge2[] = [];
  for (let triangleIdx = 0; triangleIdx < indices.length / 3; triangleIdx++) {
    const triangle = { a: vertices[indices[triangleIdx * 3]], b: vertices[indices[triangleIdx * 3 + 1]], c: vertices[indices[triangleIdx * 3 + 2]] };
    edges.push(new Edge2(triangle.a, triangle.b));
    edges.push(new Edge2(triangle.b, triangle.c));
    edges.push(new Edge2(triangle.c, triangle.a));
  }

  // remove duplicates and their original counter part
  edges.sort((a, b) => a.compare(b));
  edges = edges.filter((e, idx) => (
    edges[idx - 1]?.compare(e) !== 0 && edges[idx + 1]?.compare(e) !== 0
  ));

  if (edges.length === 0) {
    return []; // strange
  }

  // merge edge chains together until nothing can be merged
  // we may end up with more than one shape
  let chains = edges.map(e => [ e.a, e.b ]);
  let appended = true;
  for (let i = 0; i < 100 && appended; i++) { // limit iterations to 100. this algo is not made for high poly shapes
    appended = false;

    let newchains: Vector2[][] = [];
    for (let [idx, chain] of chains.entries()) {
      const appendIdx = newchains.findIndex((c, findIdx) => findIdx !== idx && (c[c.length - 1] === chain[0] || c[c.length - 1] === chain[chain.length - 1]));
      if (appendIdx !== -1) {
        const appendChain = newchains[appendIdx];
        appendChain.push(...(appendChain[appendChain.length - 1] === chain[0] ? chain : chain.reverse()).slice(1));
        if (appendChain[0] === appendChain[appendChain.length - 1]) {
          // this shape is complete: remove last and continue with potential secondary shapes
          appendChain.pop();
        }
        appended = true;
      }
      else {
        // not appendable, start new chain
        newchains.push(chain);
      }
    }
    chains = newchains;
  }

  return chains.flat();
}