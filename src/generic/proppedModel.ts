import * as fs from 'fs';
import * as path from 'path';
import { getBuffer } from 'gltf-import-export';
import { Box, Quaternion, Vector, Vector2, sortVectorsByOutline } from './math';

interface IProp {
  /* eslint-disable @typescript-eslint/naming-convention */
  // keep naming same as Anno
  Name: string,
  FileName: string,
  Position_x: string,
  Position_y: string,
  Position_z: string,
  Rotation_x: string,
  Rotation_y: string,
  Rotation_z: string,
  Rotation_w: string,
  Scale_x: string,
  Scale_y: string,
  Scale_z: string
  /* eslint-enable @typescript-eslint/naming-convention */
}
export const PROP_DEFAULTS = {
  /* eslint-disable @typescript-eslint/naming-convention */
  ConfigType: 'PROP',
  Name: '',
  Position_x: '0.000000',
  Position_y: '0.000000',
  Position_z: '0.000000',
  Rotation_x: '0.000000',
  Rotation_y: '0.000000',
  Rotation_z: '0.000000',
  Rotation_w: '1.000000',
  Scale_x: '1.000000',
  Scale_y: '1.000000',
  Scale_z: '1.000000',
  Flags: '1'
  /* eslint-enable @typescript-eslint/naming-convention */
};
interface IParticle {
  /* eslint-disable @typescript-eslint/naming-convention */
  Transformer: {
    Config: {
      Position_x: string,
      Position_y: string,
      Position_z: string,
      Rotation_x: string,
      Rotation_y: string,
      Rotation_z: string,
      Rotation_w: string,
      Scale: string
    }
  },
  Name: string
  /* eslint-enable @typescript-eslint/naming-convention */
}
export const PROPCONTAINER_DEFAULTS = {
  /* eslint-disable @typescript-eslint/naming-convention */
  ConfigType: 'PROPCONTAINER',
  Name: '',
  VariationEnabled: 0,
  VariationProbability: 100
  /* eslint-enable @typescript-eslint/naming-convention */
};
interface IFeedback {
  /* eslint-disable @typescript-eslint/naming-convention */
  Position: { x: number, y: number, z: number },
  Orientation: { x: number, y: number, z: number, w: number },
  RotationY: string,
  Name: string
  /* eslint-enable @typescript-eslint/naming-convention */
}

interface IFile {
  /* eslint-disable @typescript-eslint/naming-convention */
  // keep naming same as Anno
  // ConfigType: string,
  Transformer: {
    Config: {
      // ConfigType: string,
      // Conditions: number,
      Position_x: string,
      Position_y: string,
      Position_z: string,
      Rotation_x: string,
      Rotation_y: string,
      Rotation_z: string,
      Rotation_w: string,
      Scale: string
    }
  },
  Name: string,
  FileName: string,
  // AdaptTerrainHeight: number
  /* eslint-enable @typescript-eslint/naming-convention */
}
export const FILE_DEFAULTS = {
  /* eslint-disable @typescript-eslint/naming-convention */
  ConfigType: 'FILE',
  Transformer: {
    Config: {
      ConfigType: 'ORIENTATION_TRANSFORM',
      Conditions: '0',
      Position_x: '0.000000',
      Position_y: '0.000000',
      Position_z: '0.000000',
      Rotation_x: '0.000000',
      Rotation_y: '0.000000',
      Rotation_z: '0.000000',
      Rotation_w: '1.000000',
      Scale: '1.0'
    }
  },
  Name: '',
  FileName: '',
  AdaptTerrainHeight: 1
  /* eslint-enable @typescript-eslint/naming-convention */
};
export const FILES_DEFAULTS = {
};

type IPropMap = { [index: string]: IProp };
type IParticleMap = { [index: string]: IParticle };
type IFeedbackMap = { [index: string]: IFeedback };
type IFileMap = { [index: string]: IFile };

function dataUriToBuffer(dataUri: any) {
  const data = dataUri.slice(dataUri.indexOf(",") + 1);
  if (dataUri.indexOf("base64") >= 0) {
    return Buffer.from(data, "base64");
  }
  return Buffer.from(data, "utf8");
}

function roundVertices(vertices: number[], digitsAfter?: number) {
  const digits = Math.pow(10, (digitsAfter || 0));
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] = Math.round(vertices[i] * digits) / digits;
  }
  return vertices;
}

function buildArrayBuffer<T extends ArrayLike<number>>(typedArray: any, data: ArrayBufferView, byteOffset: number, count: number, numComponents: number, byteStride?: number): T {
  byteOffset += data.byteOffset;

  const targetLength = count * numComponents;

  if (byteStride === undefined || byteStride === numComponents * typedArray.BYTES_PER_ELEMENT) {
      return new typedArray(data.buffer, byteOffset, targetLength);
  }

  const elementStride = byteStride / typedArray.BYTES_PER_ELEMENT;
  const sourceBuffer = new typedArray(data.buffer, byteOffset, elementStride * count);
  const targetBuffer = new typedArray(targetLength);
  let sourceIndex = 0;
  let targetIndex = 0;

  while (targetIndex < targetLength) {
      for (let componentIndex = 0; componentIndex < numComponents; componentIndex++) {
          targetBuffer[targetIndex] = sourceBuffer[sourceIndex + componentIndex];
          targetIndex++;
      }

      sourceIndex += elementStride;
  }

  return targetBuffer;
}

export const enum BlockerType {
  build = 'BuildBlocker',
  feedback = 'FeedbackBlocker',
  priority = 'PriorityFeedbackBlocker'
};

export default class ProppedModel {
  private readonly props: IPropMap;
  private readonly particles: IParticleMap;
  private readonly feedbacks: IFeedbackMap;
  private readonly files: IFileMap;
  private readonly gltf: any;
  private readonly resourceFolder: string;

  public static fromFile(filePath: string) {
    const gltf = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const props: IPropMap = { };
    const particles: IParticleMap = { };
    const feedbacks: IFeedbackMap = { };
    const files: IFileMap = { };

    // create empty arrays to reduce the need for undefined checks
    if (!gltf.nodes) {
      gltf.nodes = [];
    }
    if (!gltf.meshes) {
      gltf.meshes = [];
    }
    
    for (let node of gltf.nodes) {
      if (!node.name) {
        continue;
      }

      const nodeTranslation = node.translation ? node.translation : [0, 0, 0];
      const nodeRotation = node.rotation ? node.rotation : [0, 0, 0, 1];
      const nodeScale = node.scale ? node.scale : [1, 1, 1];

      if (node.name.startsWith('prop_')) {
        const meshName = gltf.meshes[node.mesh]?.name.replace(/\.\d\d\d$/, '');

        props[node.name] = {
          /* eslint-disable @typescript-eslint/naming-convention */
          Name: node.name,
          FileName: meshName?.endsWith('.prp') ? meshName : undefined, // don't overwrite FileName if it doesn't fit
          Position_x: nodeTranslation[0].toFixed(6),
          Position_y: nodeTranslation[1].toFixed(6),
          Position_z: nodeTranslation[2].toFixed(6),
          Rotation_x: nodeRotation[0].toFixed(6),
          Rotation_y: nodeRotation[1].toFixed(6),
          Rotation_z: nodeRotation[2].toFixed(6),
          Rotation_w: nodeRotation[3].toFixed(6),
          Scale_x: nodeScale[0].toFixed(6),
          Scale_y: nodeScale[1].toFixed(6),
          Scale_z: nodeScale[2].toFixed(6)
          /* eslint-enable @typescript-eslint/naming-convention */
        };
      }
      if (node.name.startsWith('particle_')) {
        particles[node.name] = {
          /* eslint-disable @typescript-eslint/naming-convention */
          Transformer: {
            Config: {
              Position_x: nodeTranslation[0].toFixed(6),
              Position_y: nodeTranslation[1].toFixed(6),
              Position_z: nodeTranslation[2].toFixed(6),
              Rotation_x: nodeRotation[0].toFixed(6),
              Rotation_y: nodeRotation[1].toFixed(6),
              Rotation_z: nodeRotation[2].toFixed(6),
              Rotation_w: nodeRotation[3].toFixed(6),
              Scale: nodeScale[2].toFixed(6)
            }
          },
          Name: node.name
          /* eslint-enable @typescript-eslint/naming-convention */
        };
      }
      if (node.name.startsWith('fc_')) {
        const quart = {
          x: nodeRotation[0].toFixed(6), 
          y: nodeRotation[1].toFixed(6), 
          z: nodeRotation[2].toFixed(6),
          w: nodeRotation[3].toFixed(6)
        };
        feedbacks[node.name] = {
          /* eslint-disable @typescript-eslint/naming-convention */
          Position: {
            x: nodeTranslation[0].toFixed(6),
            y: nodeTranslation[1].toFixed(6),
            z: nodeTranslation[2].toFixed(6),
          },
          Orientation: quart,
          RotationY: _toRotation(quart).toFixed(6),
          Name: node.name
          /* eslint-enable @typescript-eslint/naming-convention */
        };
      }
      if (node.name.startsWith('file_')) {
        const meshName = gltf.meshes[node.mesh]?.name.replace(/\.\d\d\d$/, '');
        files[node.name] = {
          /* eslint-disable @typescript-eslint/naming-convention */
          Name: node.name,
          FileName: meshName?.endsWith('.cfg') ? meshName : undefined, // don't overwrite FileName if it doesn't fit
          Transformer: {
            Config: {
              Position_x: nodeTranslation[0].toFixed(6),
              Position_y: nodeTranslation[1].toFixed(6),
              Position_z: nodeTranslation[2].toFixed(6),
              Rotation_x: nodeRotation[0].toFixed(6),
              Rotation_y: nodeRotation[1].toFixed(6),
              Rotation_z: nodeRotation[2].toFixed(6),
              Rotation_w: nodeRotation[3].toFixed(6),
              Scale: nodeScale[3]
            }
          },
          /* eslint-enable @typescript-eslint/naming-convention */
        };
      } 
    }

    const resourceFolder = path.dirname(filePath);
    return new ProppedModel(gltf, props, particles, feedbacks, files, resourceFolder);
  }

  public getProps(): IProp[] {
    return Object.values(this.props);
  }

  public getProp(name: string): IProp {
    return this.props[name];
  }

  public getParticles(): IParticle[] {
    return Object.values(this.particles);
  }

  public getParticle(name: string): IParticle {
    return this.particles[name];
  }

  public getFeedbacks(): IFeedback[] {
    return Object.values(this.feedbacks);
  }

  public getFeedback(name: string): IFeedback {
    return this.feedbacks[name];
  }

  public getFiles(): IFile[] {
    return Object.values(this.files);
  }

  public getFile(name: string): IFile {
    return this.files[name];
  }

  public getBuildBlocker() {
    const ground = this._findGround();
    if (!ground || ground.length === 0) {
      return undefined;
    }

    // round to .5
    return ground.map(v => new Vector2(v.x, v.z).round(2));
  }

  public getDecalExtends() {
    const ground = this._findGround();
    if (!ground || ground.length < 1) {
      return undefined;
    }

    // round to .01
    let min = ground[0].round(100);
    let max = min;
    for (let v of ground) {
      min = min.down(v.round(100));
      max = max.up(v.round(100));
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    return { 
      Extents_x: ((max.x - min.x) / 2).toFixed(6), 
      Extents_y: min.y.toFixed(6), 
      Extents_z: ((max.z - min.z) / 2).toFixed(6)
    };
    /* eslint-enable @typescript-eslint/naming-convention */
  }

  public getHitBoxes() {
    return this._findHitboxes();
  }

  private _unevenBlocker: Vector2[] | undefined;
  public getUnevenBlocker() {
    if (!this._unevenBlocker) {
      const node = _findFirstNode(this.gltf, 'UnevenBlocker', this.resourceFolder, true);
      let vectors = _readVectors(node).map(e => e.toVector2());
      if (node?.indices) {
        vectors = sortVectorsByOutline(vectors, node.indices);
      }
      this._unevenBlocker = vectors;
    }
    return (this._unevenBlocker.length > 0) ? this._unevenBlocker : undefined;
  }

  private _blocker: { [index: string] : Vector2[][] } = {};
  public getBlocker(type: BlockerType) {
    if (!this._blocker[type]) {
      const blocker = [];
      const nodes = _findNodes(this.gltf, type, this.resourceFolder);
      for (let node of nodes) {
        let vectors = _readVectors(node).map(e => e.toVector2());
        if (node?.indices) {
          vectors = sortVectorsByOutline(vectors, node.indices);
        }
        if (vectors) {
          blocker.push(vectors);
        }
      }
      this._blocker[type] = blocker;
    }
    return (this._blocker[type]?.length > 0) ? this._blocker[type] : undefined;
  }

  private _dummies: { name: string, position: Vector, rotation: Quaternion, extends: Vector }[] | undefined;
  public getDummies() {
    if (!this._dummies) {
      this._dummies = [];
      const nodes = _findNodes(this.gltf, 'dummy_', this.resourceFolder);
      for (let node of nodes) {
        this._dummies.push({
          name: node.name.substr('dummy_'.length),
          position: node.translation || Vector.zero,
          rotation: node.rotation || Quaternion.default,
          extends: node.scale || Vector.one
        });
      }
    }
    return (this._dummies.length > 0) ? this._dummies : undefined;
  }

  private constructor(gltf: any, props: IPropMap, particles: IParticleMap, feedbacks: IFeedbackMap, files: IFileMap, resourceFolder: string) {
    this.gltf = gltf;
    this.props = props;
    this.particles = particles;
    this.feedbacks = feedbacks;
    this.files = files;
    this.resourceFolder = resourceFolder;
  }

  private groundVertices: Vector[] | undefined;
  private _findGround() {
    if (!this.groundVertices) {
      const node = _findFirstNode(this.gltf, 'ground', this.resourceFolder, true);
      const ground = _readVectors(node);
      let ground2 = ground.map(e => e.toVector2());
      if (node?.indices) {
        ground2 = sortVectorsByOutline(ground2, node.indices);
      }
      this.groundVertices = ground2.map(e => new Vector(e.x, ground[0].y, e.z));
    }

    return this.groundVertices;
  }

  _hitboxes: Box[] | undefined;
  private _findHitboxes() {
    if (!this._hitboxes) {
      this._hitboxes = [];
      const hitboxes = [];
      for (let node of this.gltf.nodes) {
        if (node.name?.startsWith('hitbox')) {
          hitboxes.push({ name: node.name, meshIdx: node.mesh, node: node });
        }
      }

      for (let hitbox of hitboxes) {
        const buffer = _getPositions(this.gltf, hitbox.meshIdx, this.resourceFolder);
        if (!buffer || buffer.length < 3) {
          console.warn('Invalid glTF. Could not get buffer.');
          return undefined;
        }

        const translation = Vector.fromArray(hitbox.node.translation) || Vector.zero;
        const scale = Vector.fromArray(hitbox.node.scale) || Vector.one;
        const rotation = Quaternion.fromArray(hitbox.node.rotation) || Quaternion.default;

        let minVector = Vector.fromArray(buffer) as Vector;
        let maxVector = minVector;
        for (let i = 0; i < buffer.length / 3; i++) {
          minVector = minVector.down(Vector.fromArray(buffer, i) as Vector);
          maxVector = maxVector.up(Vector.fromArray(buffer, i) as Vector);
        }

        // apply scale and translation, but not rotation
        minVector = minVector.mul(scale).add(translation);
        maxVector = maxVector.mul(scale).add(translation);

        this._hitboxes.push(Box.fromMinMax(hitbox.name, minVector, maxVector, rotation));
      }
    }

    return this._hitboxes;
  }
}

function _toRotation(q: { w: number, x: number, y: number, z: number }) {
  const acos = 2 * Math.acos(q.w);
  return q.y > 0 ? Math.PI * 2 - acos : acos;
}

function _findNodes(gltf: any, name: string, resourceFolder: string, prefixSearch: boolean = true, ignoreTrailingNumber: boolean = false) {
  const result = [];

  let nodeIdx = -1;
  let meshIdx = -1;
  for (let idx = 0; idx < gltf.nodes.length; idx++) {
    const node = gltf.nodes[idx];

    const noTrailName = (node.name && ignoreTrailingNumber) ? node.name.replace(/\.\d\d\d$/, '') : node.name;

    if (prefixSearch && (noTrailName?.startsWith(name) || gltf.meshes[node.mesh]?.name?.startsWith(name)) ||
        !prefixSearch && (noTrailName === name || gltf.meshes[node.mesh]?.name === name)) {
      nodeIdx = idx;
      meshIdx = node.mesh;

      const buffer = _getPositions(gltf, meshIdx, resourceFolder);
      const indices = _getIndices(gltf, meshIdx, resourceFolder);
      result.push({
        nodeIdx,
        meshIdx,
        name: node.name,
        translation: Vector.fromArray(gltf.nodes[nodeIdx].translation) ?? Vector.zero,
        scale: Vector.fromArray(gltf.nodes[nodeIdx].scale) ?? Vector.one,
        rotation: Quaternion.fromArray(gltf.nodes[nodeIdx].rotation) ?? Quaternion.default,
        buffer: buffer as ArrayLike<number>,
        indices: indices
      });

      if (!prefixSearch && !ignoreTrailingNumber) {
        return result;
      }
    }
  }
  return result;
}

function _findFirstNode(gltf: any, name: string, resourceFolder: string, ignoreTrailingNumber: boolean = false) {
  const nodes = _findNodes(gltf, name, resourceFolder, false, true);
  if (!nodes || nodes.length < 1) {
    return undefined;
  }
  return nodes[0];
}

function _getPositions(gltf: any, meshIdx: number, resourceFolder: string) {
  const accessorIdx = gltf.meshes[meshIdx]?.primitives[0]?.attributes?.POSITION;
  if (accessorIdx === undefined) {
    return undefined;
  }

  const ACESSOR_TYPE_VEC3 = 3;
  return _getBuffer(gltf, accessorIdx, resourceFolder, ACESSOR_TYPE_VEC3, Float32Array);
}

function _getIndices(gltf: any, meshIdx: number, resourceFolder: string) {
  const accessorIdx = gltf.meshes[meshIdx]?.primitives[0]?.indices;
  if (accessorIdx === undefined) {
    return undefined;
  }
  
  const ACESSOR_TYPE_SCALAR = 1;
  return _getBuffer(gltf, accessorIdx, resourceFolder, ACESSOR_TYPE_SCALAR, Uint16Array);
}

function _getBuffer(gltf: any, accessorIdx: number, resourceFolder: string, numComponents: number, typedArray: any) {
  const accessor = gltf.accessors[accessorIdx];
  const bufferView = gltf.bufferViews[accessor.bufferView];
  const bufferInfo = gltf.buffers[bufferView.buffer];

  const bufferFile = path.join(resourceFolder, bufferInfo.uri);
  const buffer = getBuffer(gltf, bufferView.buffer, bufferFile);
  if (buffer) {
    const bufferOffset = bufferView.byteOffset || 0;
    const bufferLength = bufferView.byteLength;
    const bufferStride = bufferView.byteStride;
    const bufferViewBuf = buffer.subarray(bufferOffset, bufferOffset + bufferLength);
    const accessorByteOffset = accessor.byteOffset || 0;

    return buildArrayBuffer(typedArray, bufferViewBuf, accessorByteOffset, accessor.count, numComponents, bufferStride);
  }

  return undefined;
}

function _readVectors(node: { translation: Vector | undefined, scale: Vector | undefined, rotation: Quaternion | undefined, buffer?: ArrayLike<number> } | undefined) {
  if (!node || !node.buffer) {
    return [];
  }
  const translation = node.translation ?? Vector.zero;
  const scale = node.scale ?? Vector.one;
  const rotation = node.rotation ?? Quaternion.default;

  const result = [];
  for (let i = 0; i < node.buffer.length / 3; i++) {
    const v = Vector.fromArray(node.buffer, i);
    if (v) {
      result.push(v.rotate(rotation).mul(scale).add(translation));
    }
  }

  return result;
}

/** quick hack sort. take first 2 triangles (first 4 positions) and swap the last two if needed */
function _sortVectorsXZ(vectors: Vector[]) {
  if (vectors.length < 4) {
    return [];
  }

  if (vectors[1].x.toFixed(4) === vectors[2].x.toFixed(4) || vectors[1].z.toFixed(4) === vectors[2].z.toFixed(4)) {
    return vectors;
  }

  return [ vectors[0], vectors[1], vectors[3], vectors[2], ...vectors.slice(4) ];
}