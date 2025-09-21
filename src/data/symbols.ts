import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';
import * as xmldoc from 'xmldoc';

import * as rda from './rda';
import * as anno from '../anno';
import * as editor from '../editor';
import * as modContext from '../editor/modContext';
import { AssetsDocument, ASSETS_FILENAME_PATTERN_STRICT, IAsset } from '../utils/assetsXml';
import * as logger from '../utils/logger';

type GuidCache = Map<string, IAsset>;

export namespace SymbolRegistry {
  const _guidCache7: GuidCache = new Map<string, IAsset>();
  const _guidCache8: GuidCache = new Map<string, IAsset>();

  const _parsedMods: Set<string> = new Set<string>();
  const _parsedFiles: Set<string> = new Set<string>();

  let _generatedPath: string;

  /** unloads vanilla symbols, e.g. after changing gamePath */
  export function resetVanilla() {
    _vanillaSymbols7 = false;
    _vanillaSymbols8 = false;

    // TODO clear cache, but for that we need separated caches
  }

  /** Does not resolve baseAsset to templates. Call resolveTemplate on individual symbols. */
  export function all(version?: anno.GameVersion) {
    version ??= modContext.getVersion();

    if (!version) {
      version = anno.GameVersion.Anno7;
    }

    _useVanillaSymbols(version);

    return version === anno.GameVersion.Anno7 ? _guidCache7 : _guidCache8;
  }

  export function resolveTemplate(symbol: IAsset) {
    // reresolve base assets
    if (symbol.baseAsset && !symbol.template) {
      symbol.template = SymbolRegistry.resolve(symbol.baseAsset)?.template;
    }
  }

  export function init(generatedPath: string) {
    _generatedPath = generatedPath;
  }

  /** Scan GUIDs from folder excluding specified file.
   * Already scanned files will be skipped.
   */
  export function scanFolder(modinfo: anno.ModInfo, exceptFilePath?: string) {
    if (_parsedMods.has(modinfo.path)) {
      return;
    }
    _parsedMods.add(modinfo.path);

    logger.log(`read ${anno.gameVersionName(modinfo.game)} GUIDs from mod: '${modinfo.path}'`);
    const files = glob.sync(ASSETS_FILENAME_PATTERN_STRICT, { cwd: modinfo.path, nodir: true });
    for (let file of files) {
      const filePath = path.join(modinfo.path, file);
      if (filePath === exceptFilePath) {
        continue;
      }

      if (_parsedFiles.has(filePath)) {
        continue;
      }
      _parsedFiles.add(filePath);

      logger.log('read GUIDs from file: ' + file);
      _readGuidsFromFile(filePath, modinfo);
    }
  }

  /** Scan GUIDs from text.
   * Use this to update scanned files.
   */
  export function scanText(modinfo: anno.ModInfo, text: string, filePath: string) {
    // don't log. It would spam every few seconds on typing text
    // logger.log('read GUIDs from text: ' + filePath);
    _readGuidsFromText(text, filePath, modinfo);
  }

  function registerAll(assets: IAsset[], version: anno.GameVersion, modid?: string) {
    const cache = all(version);
    for (var asset of assets) {
      asset.modName = modid;
      cache.set(asset.guid, asset);
    }
  }

  export function resolve(guid: string, version?: anno.GameVersion) : IAsset | undefined {
    version ??= modContext.getVersion();
    _useVanillaSymbols(version);

    return _resolve(guid, version, new Set<string>());
  }

  function _resolve(guid: string, version: anno.GameVersion, loopGuard: Set<string>) : IAsset | undefined {
    const entry = all(version).get(guid);
    if (entry?.baseAsset && !entry.template && !loopGuard.has(entry.baseAsset)) {
      loopGuard.add(guid);
      const base = _resolve(entry.baseAsset, version, loopGuard);
      if (base) {
        entry.template = base.template;
      }
    }

    return entry;
  }

  function _readGuidsFromFile(filePath: string, modinfo: anno.ModInfo) {
    const text = fs.readFileSync(filePath, 'utf8');
    _readGuidsFromText(text, filePath, modinfo);
  }

  function _readGuidsFromText(text: string, filePath: string, modinfo: anno.ModInfo)
  {
    let xmlContent;
    try {
      xmlContent = new xmldoc.XmlDocument(text);
    }
    catch {
      // be quiet, this happens a lot during typing
      return;
    }

    _readGuidsFromXmlContent(xmlContent, filePath, modinfo);
  }

  function _readGuidsFromXmlContent(xmlContent: xmldoc.XmlDocument, filePath: string, modinfo: anno.ModInfo)
  {
    let assetsDocument = new AssetsDocument(xmlContent, filePath);
    registerAll(Object.values(assetsDocument.assets), modinfo.game, modinfo.id);
  }

  let _vanillaSymbols7 = false;
  let _vanillaSymbols8 = false;
  function _useVanillaSymbols(version?: anno.GameVersion) {
    version ??= modContext.getVersion();

    if (version === anno.GameVersion.Anno8) {
      if (_vanillaSymbols8) {
        return;
      }
      _vanillaSymbols8 = true;

      if (!editor.ensureGamePath({ filePath: modContext.get().document?.fileName, version })) {
        return;
      }

      const vanillaPath = rda.getAssetsXml(version);
      if (!vanillaPath || !fs.existsSync(vanillaPath)) {
        logger.errorMessage(`Can't find \`${vanillaPath}\`. GUID lookup will not work properly.`);
        return;
      }

      let xmlContent: xmldoc.XmlDocument;
      try {
        xmlContent = new xmldoc.XmlDocument(fs.readFileSync(vanillaPath, 'utf8'));
      }
      catch {
        logger.errorMessage(`Can't parse \`${vanillaPath}\`. GUID lookup will not work properly.`);
        // don't retry. you need to change gamePath to reset
        return;
      }

      let assetsDocument = new AssetsDocument(xmlContent, vanillaPath);

      for (var guid of Object.keys(assetsDocument.assets)) {
        assetsDocument.assets[guid].location = undefined;
      }

      registerAll(Object.values(assetsDocument.assets), version, undefined);
    }
    else if (version === anno.GameVersion.Anno7) {
      if (_vanillaSymbols7) {
        return;
      }
      _vanillaSymbols7 = true;

      const assetsByGuid: { [index: string]: IAsset } = JSON.parse(fs.readFileSync(path.join(_generatedPath, 'assets.json'), { encoding: 'utf8' }));

      const cache = all(version);
      for (var guid in assetsByGuid) {
        const asset = assetsByGuid[guid];
        asset.guid = guid;
        cache.set(guid, asset);
      }
    }
  }
}