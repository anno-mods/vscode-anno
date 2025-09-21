import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

import * as fsutils from '../../generic/fsutils';

suite('file conversion tests', () => {
  test('check localization commands', async () => {
    const relTestPath = 'test/suite/data/loca';
    const tempTestPath = path.resolve('../../out/' + relTestPath);

    fsutils.ensureDir(tempTestPath);
    fs.copyFileSync(path.join('../../src/', relTestPath, 'texts_english.xml'), path.join(tempTestPath, 'texts_english.xml'));
    fs.copyFileSync(path.join('../../src/', relTestPath, 'texts_chinese.xml'), path.join(tempTestPath, 'texts_chinese.xml'));

    const modifierPath = path.join(tempTestPath, 'texts_english.xml');
    const resultPath = path.join(tempTestPath, 'texts_chinese.xml');
    await vscode.commands.executeCommand('anno-modding-tools.addMissingLoca', vscode.Uri.file(modifierPath));
    assert(fs.existsSync(resultPath));

    const resultContent = /*await xml2js.parseStringPromise*/(fs.readFileSync(resultPath, 'utf8'));
    const expectedContent = /*await xml2js.parseStringPromise*/(fs.readFileSync(path.join('../../src/', relTestPath, 'texts_chinese-expectation.xml'), 'utf8'));

    assert.deepStrictEqual(resultContent, expectedContent);
  });
});
