import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as child from 'child_process';

import { Converter } from '../Converter';
import { ModCache } from '../ModCache';
import AnnoXml from '../../generic/annoXml';
import * as fsutils from '../../generic/fsutils';

export class CfgYamlConverter extends Converter {
  _variables: { [index: string]: string } = {};

  public getName() {
    return 'cfgyaml';
  }

  public async run(files: string[], sourceFolder: string, outFolder: string, options: { variables?: { [index: string]: string }, dontOverwrite?: boolean, modCache: ModCache }) {
    const converterPath = this._asAbsolutePath("./external/AnnoFCConverter.exe");
    const _dontOverwrite = options.dontOverwrite ? fsutils.dontOverwrite : (fp: string) => fp;
    this._variables = options.variables || {};

    const cache = options.modCache;

    for (const file of files) {
      this._logger.log(`  => ${file}`);
      const targetFile = path.join(outFolder, file);
      const sourceFile = path.join(sourceFolder, file);
      cache.use(sourceFile);

      try {
        const sourceDirname = path.dirname(sourceFile);
        const targetDirname = path.dirname(targetFile);
        const basename = path.basename(targetFile, '.cfg.yaml');
        fsutils.ensureDir(targetDirname);

        const content = yaml.load(fs.readFileSync(sourceFile, 'utf8')) as any;

        if (content?.variant) {
          const variantSourceName = content.variant.source;
          const sourceCfgPath = this._findSourceCfg(sourceDirname, variantSourceName);
          if (fs.existsSync(sourceCfgPath)) {
            const sourcePathWithoutExt = path.join(path.dirname(sourceCfgPath), path.basename(sourceCfgPath, '.cfg'));
            const targetPathWithoutExt = path.join(targetDirname, basename);
            const variantPathWithoutExt = path.join(sourceDirname, basename);

            // read and modify cfg
            cache.include(sourceCfgPath);
            const cfgContent = AnnoXml.fromFile(sourcePathWithoutExt + '.cfg');
            this._runModifications(cfgContent, content.variant.modifications);
            fs.writeFileSync(_dontOverwrite(targetPathWithoutExt + '.cfg', '.cfg'), cfgContent.toString());
            this._logger.log(`  <= ${path.basename(targetPathWithoutExt)}.cfg`);
      
            // handle .fc/.cf7, but only if there's no variant specific file
            if (!fs.existsSync(variantPathWithoutExt + '.cf7') && !fs.existsSync(variantPathWithoutExt + '.fc')) {
              // first try cf7
              if (fs.existsSync(sourcePathWithoutExt + '.cf7')) {
                cache.include(sourcePathWithoutExt + '.cf7');

                const cf7Content = AnnoXml.fromFile(sourcePathWithoutExt + '.cf7');
                if (cf7Content) {
                  this._runModifications(cf7Content, content.variant.cf7);
                  fs.writeFileSync(_dontOverwrite(targetPathWithoutExt + '.cf7', '.cf7'), cf7Content.toString());
                  // this._logger.log(`  <= ${path.basename(targetPathWithoutExt)}.fc`);
                }

                try {
                  child.execFileSync(converterPath, ['-y', '-o', _dontOverwrite(targetPathWithoutExt + '.fc', '.fc'), '-w', targetPathWithoutExt + '.cf7']);
                  fs.rmSync(targetPathWithoutExt + '.cf7');
                  this._logger.log(`  <= ${path.basename(targetPathWithoutExt)}.fc`);
                }
                catch {
                  this._logger.warn(`     AnnoFCConverter failed to write ${path.basename(targetPathWithoutExt)}.fc`);
                }
              }
              // then fc
              else {
                if (this._copyIfExists(sourcePathWithoutExt + '.fc', _dontOverwrite(targetPathWithoutExt + '.fc', '.fc'))) {
                  cache.include(sourcePathWithoutExt + '.fc', );
                  this._logger.log(`  <= ${path.basename(targetPathWithoutExt)}.fc`);
                }
              }
            }
      
            // read and modify ifo, but only if there's no variant specific ifo file
            if (!fs.existsSync(variantPathWithoutExt + '.ifo') && fs.existsSync(sourcePathWithoutExt + '.ifo')) {
              cache.include(sourcePathWithoutExt + '.ifo');
              const ifoContent = AnnoXml.fromFile(sourcePathWithoutExt + '.ifo');
              this._runModifications(ifoContent, content.variant.ifo);
              fs.writeFileSync(_dontOverwrite(targetPathWithoutExt + '.ifo', '.ifo'), ifoContent.toString());
              this._logger.log(`  <= ${path.basename(targetPathWithoutExt)}.ifo`);
            }
          }
          else {
            this._logger.error(`    ${sourceCfgPath} does not exist.`);
            return false;
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

  private _runModifications(xml: AnnoXml, modifications: any[]) {
    if (!modifications) {
      return;
    }

    for (let modification of modifications) {
      if (modification.xpath) {
        // overwrite all values except xpath
        const { xpath, ...values } = modification;
        if (!xml.set(modification.xpath, values, { all: true, keepUnderscore: true })) {
          this._logger.warn(`cannot find ${modification.xpath}`);
        }
      }
      else if (modification['xpath-add']) {
        const parent = xml.findElement(modification['xpath-add']);
        if (!parent) {
          this._logger.warn(`cannot find ${modification['xpath-add']}`);
          continue;
        }
        for (let child of Object.keys(modification)) {
          if (child === 'xpath-add') { continue; }
          parent.createChild(child).set(modification[child], { keepUnderscore: true });
        }
      }
      else if (modification['xpath-remove']) {
        xml.remove(modification['xpath-remove']);
      }
    }
  }

  private _copyIfExists(source: string, target: string) {
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      return true;
    }

    return false;
  }

  private _findSourceCfg(sourceDirname: string, variantSourceName: string) {
    if (this._variables['annoRda']) {
      variantSourceName = path.normalize(variantSourceName.replace('${annoRda}', this._variables['annoRda'] || ""));
    }
    if (!path.isAbsolute(variantSourceName)) {
      variantSourceName = path.join(sourceDirname, variantSourceName);
    }
    return variantSourceName;
  }
}
