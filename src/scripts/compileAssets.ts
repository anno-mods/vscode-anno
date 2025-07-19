import * as path from 'path';
import * as xmldoc from 'xmldoc';
import * as fs from 'fs';
import { exit } from 'process';
import { AllProperties, AllDefinitions, readProperties } from './assets/properties';
import { readDataSets, dataSetToXsd } from './assets/datasets';

const OUTPUT_FILEPATH = './generated/assets.json';
const SCHEME_FILEPATH = './generated/assets.xsd';

// Templates excluded from scan
const EXCLUDE_TEMPLATES = [ 
  // 'Quest', 
  'PaMSy', 
  'Text', 
  'NoLocaText',
  'Audio', 
  'AudioText',
  // 'StarterObject', 
  // 'Collectable', 
  'Tutorial', 
  // 'News', 
  // 'Object', 
  'Profile',
  'Scenario',
  // 'Session',
  'Expedition',
  'ExpeditionOption',
  'ExpeditionDecision',
  // 'InfoTip',
  'PlayerCounterConfig',
  'GenericPopup'
];

// Templates showing tooltips, but are excluded from auto-completion
// TODO but why?
const EXCLUDE_NAME: string[] = [ 
  // 'Text', 
  // 'NoLocaText'
  // 'Audio'
];

interface IAsset {
  template?: string;
  name?: string;
  english?: string;
}

class GuidDefinition {
  templates: string[] = [];
  paths: { [index: string]: string[] } = {};
}

const MAX_POSSIBLE = 100;

class SchemeType {
  public readonly name: string;
  public multiple: boolean = false;
  public optional: boolean = true; // TODO make false
  public simple: boolean = false;
  public keys: { [index: string]: SchemeType } = {};
  public possibleValues: { [index: string]: boolean } = {};
  public typeName: string;
  public template?: string;
  public templates?: string[];

  constructor(name: string, type: string | undefined = undefined) {
    this.name = name;
    this.typeName = type ?? name + '_Type';
  }

  parseNode(node?: xmldoc.XmlElement, template?: string, specialSchemes: SpecialSchemes | undefined = undefined, skipSpecial: boolean = false) {
    if (!node || node.name === 'Test234') {
      return;
    }
    if (!skipSpecial && specialSchemes?.match(node.name)) {
      specialSchemes.get(node.name).parseNode(node, template, specialSchemes, true);
      return;
    }

    this.template = template;

    const keyOccurrence: { [index: string]: number } = {};
    for (const val of Object.keys(this.keys)) {
      keyOccurrence[val] = 0;
    }

    let noChildren = true;
    for (const val of node.children) {
      if (val.type !== 'element') {
        continue;
      }
      noChildren = false;

      const scheme = this.keys[val.name] ?? new SchemeType(val.name);
      scheme.parseNode(val, template, specialSchemes);
      this.keys[val.name] = scheme;
      keyOccurrence[val.name] = (keyOccurrence[val.name] ?? 0) + 1;
    }

    if (noChildren && Object.keys(this.possibleValues).length < MAX_POSSIBLE && node.val !== '') {
      this.possibleValues[node.val] = true;
    }

    for (const val of Object.keys(keyOccurrence)) {
      const count = keyOccurrence[val];
      this.keys[val].optional ||= count === 0;
      this.keys[val].multiple ||= count > 1;// || (val === 'Item' && (Object.keys(this.keys[val].keys).length !== 0));
    }
  }

  /**
   * omit - use any instead of complexType
   * type - default behavior
   * include - print complexTypes of the whole tree
   * simple - print simple types of the whole tree
   */
  toXsd(subTypes: 'include' | 'simple', unnamed: boolean = false, indent: string = '') {
    const printName = unnamed ? '' : ` name='${this.typeName}'`;

    if (this.simple) {
      if (!this.typeName.endsWith('Type')) return '';

      let result = `${indent}<xs:simpleType${printName}>\n${indent}  <xs:restriction base="xs:string">\n`;
      for (var value of Object.keys(this.possibleValues)) {
        result += `${indent}    <xs:enumeration value='${value}' />\n`;
      }
      result += `${indent}  </xs:restriction>\n${indent}</xs:simpleType>\n`;
      return result;
    }

    if (subTypes === 'simple') {
      let result = '';
      for (var key of Object.values(this.keys)) {
        if (key.typeName.endsWith('_Type')) {
          result += key.toXsd('simple', false, indent);
        }
      }
      return result;
    }

    const allOrSequence = Object.keys(this.keys).length > 1 ? 'all' : 'sequence';

    let result = `${indent}<xs:complexType${printName}>\n${indent}  <xs:${allOrSequence}>\n`;
    for (var keyName of Object.keys(this.keys)) {
      const key = this.keys[keyName];
      if (subTypes === 'include' && (!key.simple || key.typeName.endsWith('_Type'))) {
        result += `${indent}    <xs:element name='${keyName}' minOccurs='${key.optional ? '0' : '1'}' maxOccurs='${key.multiple ? 'unbounded' : '1'}'>\n`;
        result += key.toXsd('include', true, indent + '      ');
        result += `${indent}    </xs:element>\n`
      }
      else {
        const type = ` type='${key.typeName}'`;
        result += indent + `    <xs:element name='${keyName}'${type} minOccurs='${key.optional ? '0' : '1'}' maxOccurs='${key.multiple ? 'unbounded' : '1'}' />\n`;
      }
    }
    result += `${indent}  </xs:${allOrSequence}>\n${indent}</xs:complexType>\n`;
    return result;
  }

  getSubScheme(path: string) {
    let elements = path.split('/').filter(e => e !== '');
    let node: SchemeType | undefined = this;
    while (elements.length > 0 && node) {
      node = node.keys[elements[0]];
      elements = elements.slice(1);
    }
    return node;
  }

  getGuidDefinitions(guids: { [index: string]: GuidDefinition}, path: string = '') {
    if (this.typeName === 'GUID') {
      const def = guids[this.name] ?? new GuidDefinition();
      if (this.templates) {
        def.templates = [...new Set([... def.templates, ...this.templates])];
        def.paths[path] = this.templates;
      }
      guids[this.name] = def;
      return;
    }

    for (var key of Object.values(this.keys)) {
      key.getGuidDefinitions(guids, path + '/' + this.name);
    }
  }

  finalizeTypes(specialSchemes: SpecialSchemes) {
    if (Object.keys(this.keys).length === 0) {
      const possibleValues = Object.keys(this.possibleValues);

      this.simple = true;
      
      if (possibleValues.length === 0) {
        this.typeName = specialSchemes.get(this.name, false)?.typeName ?? 'Empty';
      }
      else if (this._isBinaryOnly(possibleValues)) {
        this.typeName = 'Flag';
      }
      else if (this._isNumbers(possibleValues)) {
        if (this._isDecimal(possibleValues)) {
          this.typeName = 'xs:decimal';
        }
        else if (this._isGUID(possibleValues)) {
          this.typeName = 'GUID';
          const templates = new Set(possibleValues.map(e => assets[e]?.template ?? '')); // there may be GUID=0 or no template assets
          this.templates = [...templates].filter(e => e && e !== '') as string[];
        }
        else {
          this.typeName = 'xs:integer';
        }
      }
      else if (this._isDegreesOnly(possibleValues)) {
        this.typeName = 'RotationType';
      }
      else if (possibleValues.length > 0 && AllDefinitions[this.name]) {
        const definition = AllDefinitions[this.name];
        var bestMatch = 0;
        var bestIndex = 0;
        if (definition.length > 1) {
          // TODO, only for Owner though
        }

        this.possibleValues = (definition[bestIndex].dataSet?.set || []).reduce((acc: {[index: string] : boolean }, value) => {
            acc[value] = true;
            return acc;
        }, {});
        this.typeName = definition[bestIndex].dataSet?.name + 'Type';
      }
      else if (possibleValues.length === MAX_POSSIBLE) {
        this.typeName = 'xs:string';
      }
      // path
      else if (possibleValues.length > 0 && possibleValues[0].indexOf('/') !== -1)
      {
        this.typeName = 'xs:string';
      }
      // special cases
      else if (this.name === 'Comment' || this.name === 'String' || possibleValues.length === 1 && possibleValues[0] === '') {
        this.typeName = 'xs:string';
      }
      return;
    }

    // special container case
    if (Object.keys(this.keys).length === 1) {
      const item = this.keys['Item'];
      if (item) {
        item.multiple = true;
      }
    }

    for (var type of Object.values(this.keys)) {
      type.finalizeTypes(specialSchemes);
    }
  }

  private _isNumbers(list: string[]) {
    for (var i of list) {
      if (!Number.isInteger(Number.parseInt(i))) {
        return false;
      }
    }
    return true;
  }

  private _isDecimal(list: string[]) {
    for (var i of list) {
      if (i.indexOf('.') !== -1) {
        return true;
      }
    }
    return false;
  }

  private _isBinaryOnly(list: string[]) {
    if (list.length === 0) {
      return false;
    }
    if (list.length === 1 && list[0] === '0') {
      return false;
    }
    for (var i of list) {
      if (i !== '0' && i !== '1') {
        return false;
      }
    }
    return true;
  }

  private _isDegreesOnly(list: string[]) {
    for (var i of list) {
      if (i !== '90' && i !== '180') {
        return false;
      }
    }
    return true;
  }

  private _isGUID(list: string[]) {
    if (list.length === 0) return false;

    // assets for example are linked by humans over 5 years
    // there are some loose ends, allow them
    const allowedErrors = list.length / 100;

    let error = 0;
    for (var i of list) {
      if (i !== '0' && !assets[i] && !filteredAssets.has(i)) {
        error++;
      }
      if (error > allowedErrors) {
        return false;
      }
    }
    return true;
  }
}

const templates: { [index: string]: Template } = {};
class Template {
  public readonly name: string;
  public usageCount: number = 0;
  public readonly isFiltered: boolean;
  public readonly isNoCompletion: boolean;
  scheme: SchemeType = new SchemeType('Values');

  constructor(name: string, parseNode?: xmldoc.XmlElement) {
    this.name = name;
    this.isFiltered = -1 !== EXCLUDE_TEMPLATES.findIndex(t => name === t);
    this.isNoCompletion = -1 !== EXCLUDE_NAME.findIndex(t => name === t);
    if (parseNode) {
      this.parseNode(parseNode);
    }
  }

  parseNode(node: xmldoc.XmlElement, firstLevelOnly: boolean = false) {
    const valuesElement = node.childNamed('Values');
    if (!valuesElement) return;

    this.usageCount++;
    // this.scheme.parseNode(valuesElement);
  }

  toXsd(subTypes: 'include' | 'simple' = 'include') {
    return this.scheme.toXsd(subTypes);
  }
}

class AssetElement {
  readonly self: xmldoc.XmlElement;
  public name: string | undefined;
  public english: string | undefined;
  public template: string | undefined;

  constructor(node: xmldoc.XmlElement) {
    this.self = node;
    const valuesElement = node.childNamed('Values');
    const standard = valuesElement?.childNamed('Standard');
    this.name = standard?.childNamed('Name')?.val;
    this.english = valuesElement?.valueWithPath('Text.LocaText.English.Text');
    if (this.english && this.english.length > 30) {
      this.english = this.english.substring(0, 30) + ' [..]';
    }
  }

  /** Considers BaseAssetGUID. */
  findTemplateName(assets: { [index: string]: IAsset }) {
    this.template = this._findTemplateName(assets);
  }

  _findTemplateName(assets: { [index: string]: IAsset }) {
    const templateElement = this.self.childNamed('Template');
    let template = templateElement?.val;
    if (template) return template;

    const baseElement = this.self.childNamed('BaseAssetGUID');
    return assets[baseElement?.val ?? '']?.template;
  }
}

const overallScheme = new SchemeType('Values');

class SpecialSchemes {
  private matchExactly: string[];
  private matchRegex: RegExp[];
  public schemeTypes: { [tag: string]: SchemeType };

  constructor() {
    this.matchExactly = [ 'Trigger', 'PreConditionList' ];
    this.matchRegex = [ /^Condition+/ ];
    this.schemeTypes = {};
  }

  match(tag: string) {
    if (-1 !== this.matchExactly.indexOf(tag)) {
      return true;
    }

    for (var regex of this.matchRegex) {
      if (regex.test(tag)) {
        return true;
      }
    }

    return false;
  }

  get(tag: string, create: boolean = true) {
    
    let type = this.schemeTypes[tag];
    if (!type && create) {
      type = new SchemeType(tag, tag + 'Type');
      this.schemeTypes[tag] = type;
    }
    return type;
  }
}

const specialSchemes = new SpecialSchemes();

function scanAssets(node: xmldoc.XmlElement, assets: { [index: string]: IAsset }) {
  if (node.name === 'Asset') {   
    const templateElement = node.childNamed('Template');
    const baseElement = node.childNamed('BaseAssetGUID');
    const valuesElement = node.childNamed('Values');
    const guid = valuesElement?.childNamed('Standard')?.childNamed('GUID')?.firstChild?.toString();
    const isValidAsset = valuesElement && (templateElement || baseElement) && guid;
    if (isValidAsset) {
      const asset = new AssetElement(node);
      asset.findTemplateName(assets);

      // update template scheme (if it is not filtered or broken)
      if (asset.template) {
        const template = templates[asset.template] ?? new Template(asset.template);
        template.parseNode(node, true);
        overallScheme.parseNode(valuesElement, template.name, specialSchemes);
        templates[template.name] = template;

        if (!template.isFiltered) {
          if (template.isNoCompletion) {
            assets[guid] = { name: `${asset.template}: ${asset.name || asset.english}` };
          }
          else {
            assets[guid] = {
              template: asset.template,
              name: asset.name,
              english: asset.english
            };
          }
        }
        else {
          filteredAssets.add(guid);
        }
      }
    }
  }
  else if (node.name === 'Template') {
    overallScheme.parseNode(node.childNamed('Properties'), undefined, specialSchemes);
  }
  else if (node.name === 'DefaultValues') {
    overallScheme.parseNode(node, undefined, specialSchemes);
  }
  // else if (node.name === 'DefaultContainerValues') {
  //   overallScheme.parseNode(node, undefined, true);
  // }
  else if (node.children) {
    for (let child of node.children) {
      if (child.type === 'element') {
        scanAssets(child, assets);
      }
    }
  }
}

if (process.argv.length < 3) {
  console.error('provide filepath to assets.xml');
  exit(-1);
}

const assetPath = process.argv[2];
if (!fs.existsSync(assetPath)) {
  console.error('input file does not exist');
  console.error(assetPath);
  exit(-1);
}

readDataSets(assetPath.replace('assets.xml', 'datasets.xml'));
readProperties(assetPath.replace('assets.xml', 'properties-toolone.xml'));

console.log(`read ${assetPath}`);
const assetXml = new xmldoc.XmlDocument(fs.readFileSync(assetPath, { encoding: 'utf8' }));

let assets: { [index: string]: IAsset } = {};
const filteredAssets = new Set<string>();

scanAssets(new xmldoc.XmlDocument(fs.readFileSync(assetPath.replace('assets.xml', 'properties.xml'), { encoding: 'utf8' })), assets);
scanAssets(new xmldoc.XmlDocument(fs.readFileSync(assetPath.replace('assets.xml', 'templates.xml'), { encoding: 'utf8' })), assets);
scanAssets(assetXml, assets);

// stats
{
  console.log(`loaded ${Object.keys(assets).length} assets and ${Object.keys(templates).length} templates`);

  let templateNames = Object.keys(templates).filter(e => !templates[e].isFiltered);
  templateNames = templateNames.sort((a,b) => templates[a].usageCount - templates[b].usageCount).slice(-5);
  for (let template of templateNames) {
    console.log(`${templates[template].usageCount} of ${template}`);
  }
}

/*
TODO
- <SocketAllocation>RadiusBuilding</SocketAllocation> allow single usage of ";"
- merge quest sub trees
*/

overallScheme.finalizeTypes(specialSchemes);
for (var scheme of Object.values(specialSchemes.schemeTypes)) {
  scheme.finalizeTypes(specialSchemes);
}

// insert special cases
const ignore = new SchemeType('ignore');
ignore.simple = false;
ignore.optional = true;
ignore.typeName = 'Empty';
overallScheme.keys['ignore'] = ignore;

// write assets.xsd
{
  if (!fs.existsSync(path.dirname(SCHEME_FILEPATH))) {
    fs.mkdirSync(path.dirname(SCHEME_FILEPATH), { recursive: true });
  }

  fs.writeFileSync(SCHEME_FILEPATH, 
    `<?xml version="1.0"?>\n<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" elementFormDefault="qualified" vc:minVersion="1.1" xmlns:vc="http://www.w3.org/2007/XMLSchema-versioning">\n`,
    { flag: 'w+' });

  fs.appendFileSync(SCHEME_FILEPATH, overallScheme.toXsd('include', false, ''));
  for (var scheme of Object.values(specialSchemes.schemeTypes)) {
    fs.appendFileSync(SCHEME_FILEPATH, scheme.toXsd('include', false, ''));
  }
  fs.appendFileSync(SCHEME_FILEPATH, dataSetToXsd());
  fs.appendFileSync(SCHEME_FILEPATH, fs.readFileSync(SCHEME_FILEPATH + ".custom.xml"));
  fs.appendFileSync(SCHEME_FILEPATH, `</xs:schema>\n`);

  console.log(`written to ${SCHEME_FILEPATH}`);
}

const guids: { [index: string]: GuidDefinition } = {};
overallScheme.getGuidDefinitions(guids);
fs.writeFileSync('./generated/guids.json', JSON.stringify(guids, undefined, 2));

// write assets.json
{
  if (!fs.existsSync(path.dirname(OUTPUT_FILEPATH))) {
    fs.mkdirSync(path.dirname(OUTPUT_FILEPATH), { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILEPATH, JSON.stringify(assets, undefined, 2));

  console.log(`written to ${OUTPUT_FILEPATH}`);
}

// write guidranges.json
const guidrangesMd = fs.readFileSync('./external/guidranges.md', 'utf8') || '';
const guidrangeLines = guidrangesMd.split('\n').filter((e: string) => e.trim().startsWith('|'));

const ranges: { name: string | null, start: number, end: number }[] = [];
for (let line of guidrangeLines) {
  const split = line.split('|');
  const name = split[1].trim();
  const start = parseInt((split[2]||'').replace(/\./g, ''));
  const end = parseInt((split[3]||'').replace(/\./g, ''));

  if (start && end) {
    ranges.push({ name, start, end });
  }
}

fs.writeFileSync('./generated/guidranges.json', JSON.stringify({
  safe: { 
    start: 1337471142,
    end: 2147483647
  },
  ranges
}, undefined, 2));
