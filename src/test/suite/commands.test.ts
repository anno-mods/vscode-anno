import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as xml2js from 'xml2js';
import * as vscode from 'vscode';

import * as fsutils from '../../generic/fsutils';

suite('file conversion tests', () => {
  // clear to avoid old files leading to wrong results
  if (fs.existsSync('../../out/test/suite/data')) {
    fs.rmdirSync('../../out/test/suite/data', { recursive: true });
  }

  // temporarily disable, there are some problems running them in GitHub actions...
  // test('.cf7 commands', async () => {
  //   const simpleCf7 = path.resolve('../../out/test/suite/data/simple.cf7');
  //   utils.ensureDir(path.dirname(simpleCf7));
  //   fs.copyFileSync('../../src/test/suite/data/simple.cf7', simpleCf7);
  //   await vscode.commands.executeCommand('anno-modding-tools.convertCf7Fc', vscode.Uri.file(simpleCf7));
  //   const simpleFc_ = utils.swapExtension(simpleCf7, '_.fc');
  //   fs.renameSync(utils.swapExtension(simpleCf7, '.fc'), simpleFc_);
  //   await vscode.commands.executeCommand('anno-modding-tools.convertFcCf7', vscode.Uri.file(simpleFc_));

  //   const cf7Content = await xml2js.parseStringPromise(fs.readFileSync(utils.swapExtension(simpleCf7, '_.cf7'), 'utf8'));
  //   const cf7Content_ = await xml2js.parseStringPromise(fs.readFileSync(simpleCf7, 'utf8'));

  //   assert.deepStrictEqual(cf7Content, cf7Content_);
  // });

  test('.dds commands', async () => {
    const fakePng = path.resolve('../../out/test/suite/data/fake.png');
    fsutils.ensureDir(path.dirname(fakePng));
    fs.copyFileSync('../../src/test/suite/data/fake.png', fakePng);
    await vscode.commands.executeCommand('anno-modding-tools.pngToDds', vscode.Uri.file(fakePng));
    assert(fs.existsSync(fakePng));

    const fakePng_ = fsutils.swapExtension(fakePng, '_.dds');
    fs.renameSync(fsutils.swapExtension(fakePng, '.dds'), fakePng_);
    await vscode.commands.executeCommand('anno-modding-tools.ddsToPng', vscode.Uri.file(fakePng_));
    assert(fs.existsSync(fsutils.swapExtension(fakePng, '_.png')));
  });

  test('.cfg.yaml commands', async () => {
    const relTestPath = 'test/suite/data/reskin';
    const tempTestPath = path.resolve('../../out/' + relTestPath);

    const modifier = 'in-modified.cfg.yaml';

    fsutils.ensureDir(tempTestPath);
    fs.copyFileSync(path.join('../../src/', relTestPath, modifier), path.join(tempTestPath, modifier));
    fs.copyFileSync(path.join('../../src/', relTestPath, 'in-config.cfg'), path.join(tempTestPath, 'in-config.cfg'));

    const modifierPath = path.join(tempTestPath, modifier);
    const resultPath = path.join(tempTestPath, path.basename(modifier, '.yaml'));
    await vscode.commands.executeCommand('anno-modding-tools.cfgyamlToCfg', vscode.Uri.file(modifierPath));
    assert(fs.existsSync(resultPath));

    const resultContent = await xml2js.parseStringPromise(fs.readFileSync(resultPath, 'utf8'));
    const expectedContent = await xml2js.parseStringPromise(fs.readFileSync(path.join('../../src/', relTestPath, 'expected.cfg'), 'utf8'));

    assert.deepStrictEqual(resultContent, expectedContent);
  });

  suite('.rdp.xml commands', () => {
    // clear to avoid old files leading to wrong results
    if (fs.existsSync('../../out/test/suite/data')) {
      fs.rmdirSync('../../out/test/suite/data', { recursive: true });
    }

    test('fetch test XML', async () => {
      const originalRdp = path.resolve('../../src/test/suite/data/sparks.rdp.xml');
      const convertingRdp = path.resolve('../../out/test/suite/data/sparks.rdp.xml');

      fsutils.ensureDir(path.dirname(convertingRdp));
      fs.copyFileSync(originalRdp, convertingRdp);

      const originalBuffer = fs.readFileSync(originalRdp, 'utf8');

      // cross check
      assert(fs.existsSync(convertingRdp));
      assert.strictEqual(originalBuffer, fs.readFileSync(convertingRdp, 'utf8'));
    });

    test('convert to native RDP, const must differ', async () => {
      const originalRdp = path.resolve('../../src/test/suite/data/sparks.rdp.xml');
      const convertingRdp = path.resolve('../../out/test/suite/data/sparks.rdp.xml');
      const targetRdp = fsutils.swapExtension(convertingRdp, '.rdp', true);

      const originalBuffer = fs.readFileSync(originalRdp, 'utf8');

      // convert to native RDP, filename doesn't change
      await vscode.commands.executeCommand('anno-modding-tools.xmlToRdp', vscode.Uri.file(convertingRdp));
      assert(fs.existsSync(targetRdp));
      assert.notStrictEqual(originalBuffer, fs.readFileSync(targetRdp));
    });

    test('convert back, content must be equal', async () => {
      const convertingRdp = path.resolve('../../out/test/suite/data/sparks.rdp.xml');
      const targetRdp = fsutils.swapExtension(convertingRdp, '.rdp', true);

      // convert back, content must be equal
      await vscode.commands.executeCommand('anno-modding-tools.rdpToSimplified', vscode.Uri.file(targetRdp));
      assert(fs.existsSync(convertingRdp));
    });

    test('compare original with roundtrip', async () => {
      const originalRdp = path.resolve('../../src/test/suite/data/sparks.rdp.xml');
      const convertingRdp = path.resolve('../../out/test/suite/data/sparks.rdp.xml');

      const originalBuffer = fs.readFileSync(originalRdp, 'utf8');

      // parse as json to avoid errors on formatting differences we don't care about (e.g. newlines)
      const resultContent = await xml2js.parseStringPromise(fs.readFileSync(convertingRdp, 'utf8'));
      const expectedContent = await xml2js.parseStringPromise(originalBuffer);

      assert.deepStrictEqual(resultContent, expectedContent);
    });

    // test('roundtrip', async () => {
    //   const originalRdp = path.resolve('../../src/test/suite/data/sparks.rdp.xml');
    //   const convertingRdp = path.resolve('../../out/test/suite/data/sparks.rdp.xml');
    //   const targetRdp = utils.swapExtension(convertingRdp, '.rdp', true);

    //   utils.ensureDir(path.dirname(convertingRdp));
    //   fs.copyFileSync(originalRdp, convertingRdp);

    //   const originalBuffer = fs.readFileSync(originalRdp, 'utf8');

    //   // cross check
    //   assert(fs.existsSync(convertingRdp));
    //   assert.strictEqual(originalBuffer, fs.readFileSync(convertingRdp, 'utf8'));

    //   // convert to native RDP, filename doesn't change
    //   console.log("xml to rdp");
    //   await vscode.commands.executeCommand('anno-modding-tools.xmlToRdp', vscode.Uri.file(convertingRdp));
    //   assert(fs.existsSync(targetRdp));
    //   assert.notStrictEqual(originalBuffer, fs.readFileSync(targetRdp));

    //   // remove for roundtrip
    //   fs.rmSync(convertingRdp);
    //   assert(!fs.existsSync(convertingRdp));

    //   // convert back, content must be equal
    //   console.log("rdp to xml");
    //   await vscode.commands.executeCommand('anno-modding-tools.rdpToSimplified', vscode.Uri.file(targetRdp));
    //   assert(fs.existsSync(convertingRdp));

    //   // parse as json to avoid errors on formatting differences we don't care about (e.g. newlines)
    //   console.log("roundtrip compare");
    //   const resultContent = await xml2js.parseStringPromise(fs.readFileSync(convertingRdp, 'utf8'));
    //   const expectedContent = await xml2js.parseStringPromise(originalBuffer);

    //   assert.deepStrictEqual(resultContent, expectedContent);
    // });
  });
});
