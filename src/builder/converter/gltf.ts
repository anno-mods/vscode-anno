import * as fs from 'fs';
import * as path from 'path';
import { ConvertToGLB } from 'gltf-import-export';
import * as child from 'child_process';

import { Converter } from '../Converter';
import * as fsutils from '../../generic/fsutils';

interface IAnimation {
  name: string,
  // bonesIdx: number,
  animIdx: number,
  children: { idx: number, name: string }[]
}

enum VertexFormat {
  Normal,
  Skeleton,
  Plant
}

const VertexFormatStrings = new Map<VertexFormat, string>([
  [ VertexFormat.Skeleton, 'P4h_N4b_G4b_B4b_T2h_I4b'],
  [ VertexFormat.Normal, 'P4h_N4b_G4b_B4b_T2h'],
  [ VertexFormat.Plant, 'P4h_N4b_G4b_B4b_T2h_C4b_C4b']
]);

export class GltfConverter extends Converter {
  public getName() {
    return 'gltf';
  }

  public async run(files: string[], sourceFolder: string, outFolder: string, options: { 
    cache: string,
    converterOptions: any }) {

    const fakePngPath = this._asAbsolutePath("./images/fake.png");
    const rdmPath = this._asAbsolutePath("./external/rdm4-bin-plant.exe");
    const changePath = options.converterOptions.changePath || '';
    const animPath = options.converterOptions.animPath || '';
    const plantPattern = options.converterOptions.plantPattern || '';

    for (const file of files) {
      this._logger.log(`  => ${file}`);
      try {
        const dirname = path.dirname(file);
        const basename = path.basename(file, '.gltf');

        fsutils.ensureDir(path.join(outFolder, dirname, changePath));
        fsutils.ensureDir(path.join(options.cache, dirname));

        const lodLevels = Math.max(1, Math.min(9, options.converterOptions.lods === undefined ? 4 : options.converterOptions.lods));
        const lodDisabled = options.converterOptions.lods === 0;

        let variantNames = !lodDisabled ? this._findVariantNames(JSON.parse(fs.readFileSync(path.join(sourceFolder, file), 'utf8'))) : [];
        if (variantNames.length > 1) {
          this._logger.log(`     has named variants: ${variantNames.map((e:string) => `'${e}'`).join(', ')}`);
        }

        for (let lodNameIdx = 0; lodNameIdx < Math.max(1, variantNames.length); lodNameIdx++) {
          for (let lodLevel = 0; lodLevel < lodLevels; lodLevel++) {
            const variantName = variantNames.length > 1 ? variantNames[lodNameIdx] : undefined;
            const gltf = JSON.parse(fs.readFileSync(path.join(sourceFolder, file), 'utf8'));

            // replace images to avoid errors with missing ones (we don't need them anyways)
            this._replaceImages(gltf, fakePngPath);

            // remove all nodes/meshes but this lod
            let meshIdx = 0;
            if (gltf.meshes.length > 1) {
              if (variantName !== undefined) {
                // multiple lod names
                const meshIndices = this._findNodeOrMesh(gltf, (e) => e.name === variantName + '_lod' + lodLevel);
                if (meshIndices.length > 0) {
                  meshIdx = meshIndices[0];
                }
                else {
                  this._logger.log(`     LOD ${lodLevel}: Skipped. No node/mesh named '${variantName}_lod${lodLevel}'`);
                  continue;
                }
              }
              else if (variantNames.length === 1) {
                // one lod, ignore name
                const meshIndices = this._findNodeOrMesh(gltf, (e) => e.name.endsWith('_lod' + lodLevel));
                if (meshIndices.length > 0) {
                  meshIdx = meshIndices[0];
                }
                else {
                  this._logger.log(`     LOD ${lodLevel}: Skipped. No node/mesh ending with '_lod${lodLevel}'`);
                  continue;
                }
              }
              else if (lodLevel > 0) {
                // single mesh models don't have lods
                continue;
              }
              else {
                // no lods, take first mesh
                meshIdx = 0;
              }
            }
            else if (lodLevel > 0) {
              // single mesh models don't have lods
              continue;
            }

            // all lods share the same animation
            const anims = this._findAnimations(gltf);
            const useSkeleton = /*gltf.animations.length > 0; */ anims.length > 0;
            const useAnimation = lodLevel === 0 && useSkeleton;

            const resourceDirectory = path.join(sourceFolder, dirname);

            let alreadyExportedModel;
            if (useAnimation && !variantName) { // don't support animation and multiple variants
              fsutils.ensureDir(path.join(outFolder, dirname, animPath));
              for (let anim of anims) {
                const tempAnimFile = path.join(options.cache, dirname, `${basename}_${anim.name}_anim_0.rdm`);
                const tempRdmFile = path.join(options.cache, dirname, `${basename}_${anim.name}.rdm`);
                const tempGlbFile = path.join(options.cache, dirname, `${basename}_${anim.name}.glb`);
                const targetFile = path.join(outFolder, dirname, animPath, `${anim.name}.rdm`);

                // we need a separate copy of gltf because we're modifying it
                // reading is easier than to do a deep copy
                const gltfForAnim = JSON.parse(fs.readFileSync(path.join(sourceFolder, file), 'utf8'));
                this._replaceImages(gltfForAnim, fakePngPath);

                this._makeUniqueBoneNames(gltfForAnim, anims, anim.name);
                await this._writeRdmFile(gltfForAnim, tempAnimFile, tempGlbFile, resourceDirectory, rdmPath, meshIdx, useAnimation,
                  useSkeleton ? VertexFormat.Skeleton : VertexFormat.Normal);
                // move only anim rdm to target location
                fs.rmSync(tempGlbFile);
                fs.rmSync(targetFile, { force: true });
                fs.renameSync(tempAnimFile, targetFile);
                this._logger.log(`  <= animation: ${path.relative(path.join(outFolder, dirname), targetFile)}`);
                // keep lod0 model for later
                if (alreadyExportedModel) {
                  fs.rmSync(tempRdmFile);
                }
                else {
                  alreadyExportedModel = tempRdmFile;
                }
              }
            }

            const isPlant = plantPattern ? new RegExp(plantPattern).test(file) : false;
            const plantText = isPlant ? ' (plant)' : '';

            // convert
            const lodname = basename + (variantName ? variantName + '_lod' + lodLevel : (lodDisabled ? '' : '_lod' + lodLevel));
            const targetFile = path.join(outFolder, dirname, changePath, lodname + '.rdm');
            if (!alreadyExportedModel) {
              // Animations are matched against the vertex groups by name.
              // Names are duplicated in case of multiple animations.
              // Clear them all out, otherwise rdm4 will complain about them.
              this._makeUniqueBoneNames(gltf, anims);

              const tempGlbFile = path.join(options.cache, dirname, lodname + '.glb');
              let vertexFormat = VertexFormat.Normal;
              if (useSkeleton) {
                vertexFormat = VertexFormat.Skeleton;
              }
              if (isPlant) {
                vertexFormat = VertexFormat.Plant;
              }
              await this._writeRdmFile(gltf, targetFile, tempGlbFile, resourceDirectory, rdmPath, meshIdx, useAnimation, vertexFormat);
              fs.rmSync(tempGlbFile);
            }
            else {
              fs.renameSync(alreadyExportedModel, targetFile);
            }
            this._logger.log(`  <= ${lodDisabled ? '' : `LOD ${lodLevel}: `}${path.relative(path.join(outFolder, dirname), targetFile)}${plantText}`);
          }
        }
      }
      catch (exception: any)
      {
        this._logger.error(exception.message);
        return false;
      }
    }

    return true;
  }

  private _replaceImages(gltf: any, fakePngUrl: string) {
    if (gltf.images)
    {
      const images = gltf.images.length;
      for (let i = 0; i < images; i++) {
        gltf.images[i].uri = fakePngUrl;
      }
    }
  }

  private _findNodeOrMesh(gltf: any, match: (mesh: { name: string }) =>  boolean ) {
    const meshIndices = new Set<number>();
    for (let i = 0; i < gltf.meshes.length; i++) {
      if (gltf.meshes[i].name && match(gltf.meshes[i])) {
        meshIndices.add(i);
      }
    }
    for (let i = 0; i < gltf.nodes.length; i++) {
      if (gltf.nodes[i].name && match(gltf.nodes[i])) {
        meshIndices.add(gltf.nodes[i].mesh);
        // overwrite mesh name to be same
        gltf.meshes[gltf.nodes[i].mesh].name = gltf.nodes[i].name;
      }
    }

    return [...meshIndices.values()];
  }

  private _findVariantNames(gltf: any): string[] {
    const meshIndices = this._findNodeOrMesh(gltf, (e) => e.name.endsWith('_lod0'));
    return meshIndices.map((e: any) => { 
      const name = gltf.meshes[e].name;
      return name?.substr(0, name?.length - '_lod0'.length);
    }).filter((e: any) => e !== undefined);
  }

  private _findAnimations(gltf: any) {
    const animations: IAnimation[] = [];

    if (!gltf.animations) {
      return animations;
    }

    const allParentNodes = gltf.nodes.map((node: any, idx: number) => ({ index: idx, ...node })).filter((e: any) => e.children !== undefined);
    for (let i = 0; i < gltf.animations.length; i++) {
      let anim = gltf.animations[i];
      // check only first target node, it's unlikely that the others are not there (at least for now)
      if (!anim.channels || anim.channels[0].target?.node === undefined) {
        this._logger.warn(`Animation this._logger targets are missing.`);
        continue;
      }
      const animParent = allParentNodes.find((e: any) => -1 !== e.children.indexOf(anim.channels[0].target.node) );
      if (!animParent) {
        this._logger.warn(`Matching nodes to animation this._logger targets are missing.`);
        this._logger.warn(`Node ${anim.channels[0].target.node} not found or not part of a bones group.`);
        continue;
      }

      const children = [];
      const addStack = [...animParent.children];
      while (addStack.length > 0) {
        const child = addStack.shift();
        children.push({
          idx: child,
          name: gltf.nodes[child].name.slice()
        });
        if (gltf.nodes[child].children) {
          addStack.push([...gltf.nodes[child].children]);
        }
      }

      animations.push({
        name: animParent.name || animParent.idx.toString(),
        // bonesIdx: animParent.idx,
        animIdx: i,
        children 
      });
    }

    return animations;
  }

  private _makeUniqueBoneNames(gltf: any, anims: IAnimation[], keepSame?: string) {
    if (!keepSame && anims.length > 0) {
      // It's important for other LODs to have at least one set of same bone names, so always keep first unchanged.
      keepSame = anims[0].name;
    }

    for (let anim of anims) {
      for (let child of anim.children) {
        gltf.nodes[child.idx].name = (keepSame && anim.name === keepSame) ? child.name.slice() : (anim.name + '_' + child.name + '_' + anim.name);
      }
    }

    // limit animations to 1
    if (anims.length > 1) {
      gltf.animations = [ gltf.animations[anims[0].animIdx] ];
    }
  }

  private _writeRdmFile(gltf: any, targetFile: string, tempFile: string, resourceDirectory: string, rdmPath: string, 
    meshIdx: number, 
    useAnimation: boolean, 
    vertexFormat: VertexFormat) {
    return new Promise((resolve, reject) => {
      try {
        ConvertToGLB(gltf, path.join(resourceDirectory, 'fake.gltf'), tempFile);

        const stdout = child.execFileSync(rdmPath, [
          '--gltf-mesh-index', meshIdx.toString(),
          '-g', VertexFormatStrings.get(vertexFormat) ?? 'P4h_N4b_G4b_B4b_T2h',
          '-n', '-o', path.dirname(targetFile),
          '-i', tempFile,
          ...(vertexFormat == VertexFormat.Skeleton ? [ '--skeleton' ] : []),
          ...(useAnimation ? [ '--animation'] : []),
          '--force' // overwrite existing files
        ], { stdio : 'pipe' });
        resolve(true);
      } catch (exception) {
        reject(exception);
      }
    });
  }
}
