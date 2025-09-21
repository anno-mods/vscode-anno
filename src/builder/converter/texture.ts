import * as fs from 'fs';
import * as path from 'path';

import { Converter } from '../Converter';
import { ModCache } from '../ModCache';
import * as dds from '../../tools/dds';
import * as fsutils from '../../other/fsutils';

export class TextureConverter extends Converter {
  public getName() {
    return 'texture';
  }

  public async run(files: string[], sourceFolder: string, outFolder: string, options: {
    cache: string,
    converterOptions: any,
    modCache: ModCache
  }) {
    const cache = options.modCache;

    // enable icon handling to avoid icon LODs
    let iconHandling = options.converterOptions.icon ? true : false;

    for (const file of files) {
      this._logger.log(`  => ${file}`);
      const lodLevels = Math.max(0, Math.min(9, options.converterOptions.lods === undefined ? 3 : options.converterOptions.lods));
      const changePath = options.converterOptions.changePath || '';
      const sourceFile = path.join(sourceFolder, file);

      try {
        const dirname = path.dirname(file);
        const basename = path.basename(file, '.png');
        const mapsPath = ((path.basename(dirname) === changePath) ? dirname : path.join(dirname, changePath)).replace(/\\/g, '/');
        if (mapsPath.startsWith('data/ui')) {
          // vanilla icon path does not need special handling
          iconHandling = false;
        }

        const lodFilePaths: string[] = [];
        if (lodLevels === 0) {
          // lods disabled, don't change file name
          lodFilePaths.push(path.join(outFolder, mapsPath, basename + '.dds'));
        }
        else {
          for (let lodLevel = 0; lodLevel < lodLevels; lodLevel++) {
            lodFilePaths.push(path.join(outFolder, mapsPath, basename + '_' + lodLevel + '.dds'));
          }
        }

        const targetFolder = path.dirname(lodFilePaths[0]);
        if (cache.use(sourceFile, targetFolder)) {
          this._logger.log(`     no update required`);
          continue;
        }

        fsutils.ensureDir(path.join(outFolder, mapsPath));
        fsutils.ensureDir(path.join(options.cache, dirname));

        let textures = dds.convertToTexture(sourceFile, targetFolder, dds.TextureFormat.unknown, iconHandling ? 1 : lodLevels);
        if (!textures) {
          return false;
        }
        if (iconHandling) {
          // copy lod0 for icons to avoid blurry icons
          textures = [...Array(lodLevels).keys()].map((index: number) => {
            if (index !== 0) {
              fs.copyFileSync(lodFilePaths[0], lodFilePaths[index]);
            }
            return path.basename(lodFilePaths[index]);
          });
        }
        for (var [index, texture] of textures.entries()) {
          this._logger.log(`  <= ${lodLevels ? `LOD ${index}: ` : ''}${path.relative(path.dirname(file), path.relative(outFolder, path.join(targetFolder, texture)))}`);
          cache.output(path.join(targetFolder, texture));
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
}
