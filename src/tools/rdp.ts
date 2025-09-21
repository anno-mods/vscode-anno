/*
uses https://github.com/anno-mods/FileDBReader
*/

/* eslint-disable @typescript-eslint/naming-convention */
/* naming convention is disabled because most objects are used for direct export to XML */
import * as fs from 'fs';
import * as path from 'path';
import * as child from 'child_process';
import * as xml2js from 'xml2js';

import * as fsutils from '../generic/fsutils';
import * as logger from '../generic/logger';

let _converterPath: string | undefined;
let _interpreterPath: string | undefined;
export function init(externalPath: string) {
  _converterPath = path.join(externalPath, 'FileDBReader/FileDBReader.exe');
  _interpreterPath = path.join(externalPath, 'FileDBReader/FileFormats/rdp.xml');
}

interface IRdpContent {
  FrameCount: string,
  FrameTime: string,
  Looped?: string,
  ParticleCount?: string,
  P_Starts?: string,
  P_Ends?: string,
  P_Materials?: string,
  TotalTickCount?: string,
  T_Positions?: string,
  T_Rotations?: string,
  T_Scales?: string,
  T_Colors?: string,

  Particles?: {
    Particle: IParticle[]
  }
}

interface IParticle {
  Material: string,
  StartFrame: string
  Ticks: {
    Tick: ITick[]
  }
}

interface ITick {
  PositionXYZ: string,
  RotationXYZ: string,
  ScaleXYZ: string,
  ColorARGB: string
}

export class Rdp {
  private _content: IRdpContent;
  
  public static fromObject(object: any) {
    return new Rdp(object);
  }

  public static async fromRdp(sourceFile: string) {
    if (!_converterPath) {
      return undefined;
    }

    try {
      const dirname = path.dirname(sourceFile);
      const basename = path.basename(sourceFile, '.rdp');
  
      const res = child.execFileSync(_converterPath, [
        'fctohex',
        '-f', sourceFile, 
        '-i', _interpreterPath as string
      ], {
        cwd: path.dirname(sourceFile)
      });
      if (res.toString()) {
        logger.log(res.toString());
      }
  
      const expectedReaderFile = path.join(dirname, basename) + '_fcimport.xml';
      const xmlString = fs.readFileSync(expectedReaderFile, 'utf8').toString();
      fs.rmSync(expectedReaderFile);
      const content = (await xml2js.parseStringPromise(xmlString, { explicitArray : false })).Content;
      return new Rdp(content);

    }
    catch (exception: any) {
      logger.log(exception.message);
      return undefined;
    }
  }

  public simplify() {
    if (!this._content || !this._content.P_Starts || !this._content.P_Ends || !this._content.P_Materials ||
      !this._content.T_Positions || !this._content.T_Rotations || !this._content.T_Scales || !this._content.T_Colors ||
      !this._content.ParticleCount) {
      logger.error('Invalid RDP XML file');
      return false;
    }

    if (this._content?.P_Starts && this._content?.P_Starts?.length > 0) {
      const particleCount = this._content.P_Starts.length;
      this._content.Particles = { Particle: [] };

      const materials = _cdataToArray(this._content?.P_Materials);
      const starts = _cdataToArray(this._content?.P_Starts);
      const ends = _cdataToArray(this._content?.P_Ends);

      const tickData = {
        colors: _cdataToArray(this._content.T_Colors),
        positions: _cdataToArray(this._content.T_Positions),
        rotations: _cdataToArray(this._content.T_Rotations),
        scales: _cdataToArray(this._content.T_Scales)
      };

      const totalFrameCount = parseInt(this._content.FrameCount);

      let tickOffset = 0;
      for (let particleIdx = 0; particleIdx < parseInt(this._content.ParticleCount); particleIdx++) {
        const start = parseInt(starts[particleIdx]);
        const end = parseInt(ends[particleIdx]);
        const frameCount = (end - start + totalFrameCount) % totalFrameCount + 1;
        this._content.Particles.Particle.push({
          'Material': materials[particleIdx],
          'StartFrame': start.toString(),
          'Ticks': { 'Tick': _toSimplifiedTicks(tickData, tickOffset, frameCount) }
        });
        tickOffset += frameCount;
      }

      const { 
        ParticleCount, TotalTickCount, 
        P_Starts, P_Ends, P_Materials,
        T_Positions, T_Rotations, T_Scales, T_Colors, 
        ...cleanedContent} = this._content;
        this._content = cleanedContent;
    }

    return true;
  }

  public isSimplified() {
    return this._content.Particles !== undefined;
  }

  public complicate() {
    if (!this._content || !this._content.Particles || !this._content.Particles.Particle) {
      logger.error('Invalid RDP XML file');
      return false;
    }

    // ensure ParticleCount is inserted at the right position
    const { FrameCount, FrameTime, Looped, ...contentAfterLooped } = this._content;
    this._content = {
      FrameCount: this._content.FrameCount,
      FrameTime: this._content.FrameTime,
      Looped: this._content.Looped || "0",
      ParticleCount: this._content.Particles.Particle.length.toString(),
      ...contentAfterLooped
    };

    const particles = this._content.Particles as { Particle: IParticle[] };

    const frameCount = parseInt(this._content.FrameCount);
    this._content.P_Starts = _arrayToCdata(particles.Particle.map((e: any) => e.StartFrame));
    this._content.P_Ends = _arrayToCdata(particles.Particle.map((e: any) => (parseInt(e.StartFrame) + e.Ticks.Tick.length - 1) % frameCount));
    this._content.P_Materials = _arrayToCdata(particles.Particle.map((e: any) => e.Material));

    this._content.TotalTickCount = particles.Particle.reduce((total: Number, e: any) => (total += e.Ticks.Tick.length), 0).toString();
    this._content = { ...this._content, ..._toComplicatedTicks(particles.Particle) };

    delete this._content.Particles;

    return true;
  }

  public writeXml(targetFile: string) {
    const xmlBuilder = new xml2js.Builder({ rootName: 'Content', headless: true });
    fs.writeFileSync(targetFile, xmlBuilder.buildObject(this._content));
  }

  public async writeRdp(targetFile: string) {
    if (!_converterPath) {
      return false;
    }

    try {
      const dirname = path.dirname(targetFile);

      // FileDBReader takes the the first dot and replaces everything after with xml
      let tempname = fsutils.swapExtension(targetFile, '-temp.xml', true);

      fsutils.ensureDir(dirname);
      this.writeXml(tempname);

      const res = child.execFileSync(_converterPath, [
        'hextofc',
        '-f', tempname,
        '-i', _interpreterPath as string,
      ], {
        cwd: path.dirname(tempname)
      });
      if (res.toString()) {
        logger.log(res.toString());
      }

      fs.rmSync(tempname);
      // FileDBReader adds _fcexport if input filename ends with .xml?
      tempname = fsutils.swapExtension(targetFile, '-temp.fc', true);
      fs.renameSync(tempname, targetFile);
    }
    catch (exception: any) {
      logger.log(exception.message);
      return false;
    }
    return true;
  }

  private constructor(content: any) {
    this._content = content;
  }

  public content() {
    return this._content;
  }
}

export async function rdpToXml(sourceFile: string, targetFolder: string, options?: { simplify?: boolean, dontOverwrite: boolean }) {
  const rdp = await Rdp.fromRdp(sourceFile);
  if (!rdp) {
    return false;
  }

  if (options?.simplify) {
    rdp.simplify();
  }

  let targetFile = path.join(targetFolder, path.basename(sourceFile)) + '.xml';
  if (options?.dontOverwrite) {
    targetFile = fsutils.dontOverwrite(targetFile, '.rdp.xml');
  }
  rdp.writeXml(targetFile);
}

export async function xmlToRdp(sourceFile: string, targetFolder: string, options?: { dontOverwrite: boolean }) {
  const xmlString = fs.readFileSync(sourceFile, 'utf8').toString();
  const content = (await xml2js.parseStringPromise(xmlString, { explicitArray : false })).Content;
  const rdp = Rdp.fromObject(content);

  if (rdp.isSimplified()) {
    rdp.complicate();
  }

  let targetFile = path.join(targetFolder, path.basename(sourceFile, '.xml'));
  if (options?.dontOverwrite) {
    targetFile = fsutils.dontOverwrite(targetFile, '.rdp');
  }
  return await rdp.writeRdp(targetFile);
}

function _cdataToArray(cdata: string) {
  return cdata.substring('CDATA['.length, cdata.length - 1).split(' ');
}

function _arrayToCdata(array: any[]) {
  return 'CDATA[' + array.join(' ') + ']';
}

function _scaleToInt(value: number, min: number, max: number, factor: number) {
  return Math.max(min, Math.min(max, Math.round(value * factor)));
}

function _toSimplifiedTicks(tickData: any, offset: number, count: number) {
  const _asPosition = ((e: string[]) => (e.map((x) => (parseInt(x) / 32767.0).toFixed(6)).join(' ')));
  const _asScale = ((e: string[]) => (e.map((x) => (parseInt(x) / 255.0 * 1.0).toFixed(4)).join(' ')));
  const _asRotation = ((e: string[]) => (e.map((x) => (parseInt(x) / 256.0 * 360.0).toFixed(1)).join(' ')));
  const _asColor = ((e: string[]) => (e.join(' ')));

  const ticks = [];
  for (let idx = offset; idx < offset + count; idx++) {
    ticks.push({
      PositionXYZ: _asPosition([ tickData.positions[idx*3], tickData.positions[idx*3+1], tickData.positions[idx*3+2] ]),
      RotationXYZ: _asRotation([ tickData.rotations[idx*3], tickData.rotations[idx*3+1], tickData.rotations[idx*3+2] ]),
      ScaleXYZ: _asScale([ tickData.scales[idx*3], tickData.scales[idx*3+1], tickData.scales[idx*3+2] ]),
      ColorARGB: _asColor([ tickData.colors[idx*4+3], tickData.colors[idx*4+2], tickData.colors[idx*4+1], tickData.colors[idx*4] ])
    });
  }
  return ticks;
}

function _toComplicatedTicks(particles: IParticle[]) {
  const _reduce = (particles: IParticle[], attribute: string, conversion: (e: string) => string) => {
    return particles?.reduce((array: string[], e: IParticle) =>
      array.concat(e.Ticks.Tick.map((tick: ITick) => conversion(tick[attribute as keyof ITick])).join(' ')), []);
  };

  return {
    T_Positions: _arrayToCdata(_reduce(particles, 'PositionXYZ', (val: string) =>
      val.split(' ').map((e: string) => _scaleToInt(parseFloat(e), -32767, 32767, 32767).toString()).join(' ')
    )),
    T_Rotations: _arrayToCdata(_reduce(particles, 'RotationXYZ', (val: string) =>
      val.split(' ').map((e: string) => _scaleToInt(parseFloat(e), 0, 255, 1 / 360.0 * 256.0).toString()).join(' ')
    )),
    T_Scales: _arrayToCdata(_reduce(particles, 'ScaleXYZ', (val: string) =>
      val.split(' ').map((e: string) => _scaleToInt(parseFloat(e), 0, 255, 255).toString()).join(' ')
    )),
    T_Colors: _arrayToCdata(_reduce(particles, 'ColorARGB', (val: string) =>
    val.split(' ').reverse().join(' ')
    ))
  };
}