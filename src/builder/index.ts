import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

import { Converter, ILogger } from './Converter';
import { StaticConverter } from './converter/static';
import { Cf7Converter } from './converter/cf7';
import { TextureConverter } from './converter/texture';
import { GltfConverter } from './converter/gltf';
import { ModinfoConverter } from './converter/modinfo';
import { RdpxmlConverter } from './converter/rdpxml';
import { CfgYamlConverter } from './converter/cfgyaml';

import { ModCache } from './ModCache';
import * as anno from '../anno';
import * as curltar from '../tools/curltar';
import * as rdp from '../tools/rdp';
import * as dds from '../tools/dds';
import * as xmltest from '../tools/xmltest';
import * as fsutils from '../generic/fsutils';
import { AssetsConverter } from './converter/assets';

export class ModBuilder {
  _converters: { [index: string]: Converter } = {};
  _logger;
  _asAbsolutePath;
  _variables;

  public constructor(logger: ILogger, asAbsolutePath: (relative: string) => string, variables: { [index: string]: string }) {
    rdp.init(asAbsolutePath('./external/'));
    dds.init(asAbsolutePath('./external/'));

    this._logger = logger;
    this._asAbsolutePath = asAbsolutePath;
    this._variables = variables;

    this._addConverter(new StaticConverter());
    this._addConverter(new Cf7Converter());
    this._addConverter(new TextureConverter());
    this._addConverter(new GltfConverter());
    this._addConverter(new ModinfoConverter());
    this._addConverter(new RdpxmlConverter());
    this._addConverter(new CfgYamlConverter());
    this._addConverter(new AssetsConverter());
  }

  private _addConverter(converter: Converter) {
    this._converters[converter.getName()] = converter;
    converter.init(this._logger, this._asAbsolutePath);
  }

  public async build(filePath: string, targetFolder?: string): Promise<boolean> {
    this._logger.log('Build ' + filePath);
    const modJson = anno.readModinfo(path.dirname(filePath));
    if (!modJson) {
      this._logger.error('Errors in modinfo.json: ' + path.dirname(filePath));
      return false;
    }

    let sourceFolders: string[] = Array.isArray(modJson.src) ? modJson.src : [ modJson.src ];
    sourceFolders = sourceFolders.map(x => path.dirname(filePath) + '/' + x);
    for (let folder of sourceFolders) {
      if (!fs.existsSync(folder)) {
        this._logger.error('Incorrect source folder: ' + folder);
        return false;
      }
    }
    if (sourceFolders.length === 0) {
      this._logger.error('No source folder specified');
      return false;
    }

    const outFolder = targetFolder ?? this._getOutFolder(filePath, modJson);
    const cache = path.join(path.dirname(filePath), '.modcache');
    this._logger.log('Target folder: ' + outFolder);
    fsutils.ensureDir(outFolder);

    const modCache = new ModCache(path.dirname(filePath), this._variables['annoRda']);
    modCache.load();

    modJson.converter = modJson.converter ? [...modJson.converter, {
      "action": "assets"
    }] : [
      {
        "action": "static",
        "pattern": "{banner.*,content*.txt,!(imya)*.md,data/config/**/*,**/*.include.xml,data/infotips/*,data/**/*.fc.xml,data/**/*.cfg.xml,**/icon*.png,**/*.lua}"
      },
      {
        "action": "static",
        "pattern": "data/{base/config/**/*,**/*.fx}"
      },
      {
        "action": "cf7",
        "pattern": "{data,products,shared}/**/*.cf7"
      },
      {
        "action": "rdpxml",
        "pattern": "{data,products,shared}/**/*.rdp.xml"
      },
      {
        "action": "gltf",
        "pattern": "{data,products,shared}/**/!(propsonly)*.gltf",
        "lods": 5,
        "changePath": "rdm",
        "animPath": "anim",
        "plantPattern": ".*(_field|_tree|_field).gltf"
      },
      {
        "action": "cfgyaml",
        "pattern": "{data,products,shared}/**/*.cfg.yaml"
      },
      {
        "action": "texture",
        "pattern": "{data,products,shared}/**/*_{diff,norm,height,metal,mask,rga,r_a,r_a+b}.png",
        "lods": 3,
        "changePath": "maps"
      },
      {
        "action": "texture",
        "pattern": "{data,products,shared}/**/icon*.png",
        "lods": 3,
        "icon": true
      },
      {
        "action": "static",
        "pattern": "{data,products,shared}/**/*.{cfg,ifo,prp,fc,rdm,dds,rdp}"
      },
      {
        "action": "assets"
      },
      {
        "action": "modinfo"
      }
    ];

    for (const sourceFolder of sourceFolders) {
      this._logger.log('Source folder: ' + sourceFolder);

      for (const entry of modJson.converter) {
        const allFiles = entry.pattern ? glob.sync(entry.pattern, { cwd: sourceFolder, nodir: true }) : [];
        const converter = this._converters[entry.action];
        if (converter) {
          this._logger.log(`${entry.action}` + (entry.pattern?`: ${entry.pattern}`:''));
          const result = await converter.run(allFiles, sourceFolder, outFolder, {
            cache,
            modJson,
            converterOptions: entry,
            variables: this._variables,
            modCache
          });
          if (!result) {
            this._logger.error('Error: converter failed: ' + entry.action);
            return false;
          }
        }
        else {
          this._logger.error('Error: no converter with name: ' + entry.action);
          return false;
        }
      }
    }

    this._logger.log(`bundles`);

    if (modJson.Development?.Bundle) {
      for (const bundle of modJson.Development?.Bundle) {
        if (bundle.startsWith('.')) {
          await this._buildBundle(filePath, bundle, cache, outFolder);
        } else {
          this._downloadBundle(bundle, cache, outFolder);
        }
      }

      this._renameModFolders(outFolder);
    }

    for (const sourceFolder of sourceFolders) {
      const testInputFolder = path.join(sourceFolder, 'tests');
      if (fs.existsSync(sourceFolder)) {
        this._logger.log(`Run tests from ${testInputFolder}`);

        const testTarget = path.join(outFolder, 'data/config/export/main/asset/assets.xml');

        this._logger.log(`cache: ${cache}`);

        if (!xmltest.test(testInputFolder, outFolder, testTarget, cache)) {
          return false;
        }
      }
      // else {
      //   this._logger.log(`No test folder available: ${testFolder}`);
      // }
    }

    if (!modCache.isCiRun()) {
      modCache.saveVanilla();
    }
    modCache.save();

    this._logger.log(`${this._getModName(filePath, modJson.modinfo ?? modJson)} done`);
    return true;
  }

  private async _buildBundle(bundleTarget: string, bundle: string, cache: string, outFolder: string) {
    const modinfoPath = path.join(path.dirname(bundleTarget), bundle, 'modinfo.json');
    if (!fs.existsSync(modinfoPath)) {
      this._logger.error(`  cannot bundle ${bundle}`);
      return;
    }

    const modinfo = anno.readModinfo(path.dirname(modinfoPath));
    if (!modinfo) {
      this._logger.error(`  cannot bundle ${bundle}`);
      return;
    }

    // const modName = this._getModName(modinfoPath, modinfo.modinfo);
    const targetFolder = path.join(outFolder, path.basename(bundle));

    const annoRda = path.join(path.dirname(modinfoPath), '.vanilla');
    const builder = new ModBuilder(this._logger, this._asAbsolutePath, { annoMods: this._variables['annoMods'], annoRda });
    await builder.build(modinfoPath, targetFolder);
  }

  private _downloadBundle(bundle: string, cache: string, outFolder: string) {
    const fileName = path.basename(bundle);
    const version = path.basename(path.dirname(bundle)).replace(/[^\w\-\.]/g, '');
    const targetPath = path.join(cache, 'downloads', fsutils.insertEnding(fileName, '-' + version));
    if (!fs.existsSync(targetPath)) {
      this._logger.log(`   * download ${version}/${fileName}`);
      curltar.downloadFile(bundle, targetPath, this._logger);
    }
    else {
      this._logger.log(`   * skip download of ${version}/${fileName}`);
    }
    this._logger.log(`  <= extract content`);
    curltar.extractZip(targetPath, outFolder, this._logger);
  }

  private _renameModFolders(modsPath: string) {
    const modinfoPaths = glob.sync("*/modinfo.json", { cwd: modsPath, nodir: true });
    for (var modinfoPath of modinfoPaths) {
      const namedModPath = path.join(modsPath, path.dirname(modinfoPath));
      const modinfo = anno.readModinfo(namedModPath);
      if (!modinfo) {
        continue;
      }

      if (!modinfo.modinfo.ModID) {
        continue;
      }

      const idModPath = path.join(path.dirname(namedModPath), modinfo.modinfo.ModID);
      if (namedModPath != idModPath) {
        if (fs.existsSync(idModPath)) {
          fs.rmdirSync(idModPath, { recursive: true });
        }
        fs.renameSync(namedModPath, idModPath);
      }
    }
  }

  private _getOutFolder(filePath: string, modJson: any) {
    let outFolder = modJson?.Development?.DeployPath ?? modJson.out ?? '${annoMods}/${modName}';
    outFolder = outFolder.replace('${modName}', this._getModName(filePath, modJson.modinfo ?? modJson));
    if (this._variables['annoMods']) {
      outFolder = path.normalize(outFolder.replace('${annoMods}', this._variables['annoMods']));
    }
    if (!path.isAbsolute(outFolder)) {
      outFolder = path.join(path.dirname(filePath), outFolder);
    }
    return outFolder;
  }

  private _getModName(filePath: string, modinfo?: any) {
    if (!modinfo?.ModName?.English) {
      return path.basename(path.dirname(filePath));
    }
    return `[${modinfo?.Category?.English}] ${modinfo?.ModName?.English}`;
  }
}
