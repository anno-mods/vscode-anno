import * as vscode from 'vscode';
import * as channel from '../channel';
import * as fs from 'fs';
import * as path from 'path';
import * as xmldoc from 'xmldoc';
import { Loca } from '../../generic/loca';

export class CheckLoca {
	public static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.checkLoca', async (fileUri) => {
        const locaFolder = path.dirname(fileUri.fsPath);
        const extension = (<string>fileUri.fsPath).endsWith('.include.xml') ? '.include.xml' : '.xml';
        
        let foundLanguages: string[] = [];
        for (const language of Loca.LANGUAGES) {
          let languageFile = `texts_${language}${extension}`;
          if (fs.existsSync(path.join(locaFolder, languageFile))) {
            foundLanguages.push(languageFile);
          }
        }

        if (foundLanguages.length <= 1) {
          vscode.window.showWarningMessage('Can\'t check language mismatch with only one language file.');
          return;
        }

        const totalSet = new Set<string>();

        let guidSets: Loca.Texts[] = [];
        for (const language of foundLanguages) {
          const set = Loca.readTextsFromFile(path.join(locaFolder, language));
          for (const guid of Object.keys(set)) {
            totalSet.add(guid);
          }
          guidSets.push(set);
        }

        let errorCount = 0;

        for (const guid of totalSet) {
          let missingIn: string[] = [];
          guidSets.forEach((set, index) => {
            if (!set[guid]) {
              missingIn.push(foundLanguages[index]);
            }
          });

          if (missingIn.length > 0) {
            channel.error(`GUID ${guid} is missing in ${missingIn.join(', ')}.`);
            if (errorCount === 0) {
              channel.show();
            }
            errorCount++;
          }
        }

        if (errorCount) {
          vscode.window.showErrorMessage(`Missing texts for ${errorCount} GUIDs detected.`);
        }
        else {
          vscode.window.showInformationMessage(`Available GUIDs are same in all text files.`);
        }
      }),
      vscode.commands.registerCommand('anno-modding-tools.addMissingLoca', async (fileUri) => {
        const locaFolder = path.dirname(fileUri.fsPath);
        const extension = (<string>fileUri.fsPath).endsWith('.include.xml') ? '.include.xml' : '.xml';

        const english = path.join(locaFolder, `texts_english${extension}`);
        if (!fs.existsSync(english)) {
          vscode.window.showWarningMessage(`texts_english${extension} is missing.`);
          return;
        }

        let newFileCount = 0;
        let updateFileCount = 0;
        for (const language of Loca.LANGUAGES) {
          if (language === 'english') {
            continue;
          }

          const languageFile = `texts_${language}${extension}`;
          const languageFilePath = path.join(locaFolder, languageFile);

          let texts;
          if (fs.existsSync(languageFilePath)) {
            texts = Loca.readTextsFromFile(languageFilePath);
            fs.renameSync(languageFilePath, languageFilePath + `-bak`);
            // channel.log(`Update texts_english${extension} -> ${languageFile}`);
            updateFileCount++;
          }
          else {
            newFileCount++;
            // channel.log(`Copy   texts_english${extension} -> ${languageFile}`);
          }

          Loca.updateTexts(english, languageFilePath, texts);
          if (fs.existsSync(languageFilePath + `-bak`)) {
            fs.rmSync(languageFilePath + `-bak`);
          }
        }

        vscode.window.showInformationMessage(`${newFileCount} language files created, ${updateFileCount} language files updated.`);
      })
    ];

    return disposable;
	}

  // static findTexts(filePath: string): Loca.Texts {
  //   const result: Loca.Texts = {};

  //   const doc = new xmldoc.XmlDocument(
  //     this.escapeContents(
  //       fs.readFileSync(filePath, 'utf-8')));

  //   Loca.executeOnTexts(doc, (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => {
  //     const text: Loca.Text = { text: textNode.text };
  //     for (const node of parentElement.children) {
  //       if (node.type === 'comment' && node.comment.includes('TODO')) {
  //         text.comments = [...(text.comments ?? []), node.comment];
  //       }
  //     }
  //     result[guid] = text;
  //   });

  //   return result;
  // }

  // static updateTexts(templatePath: string, targetPath: string, texts?: Loca.Texts) {
  //   const english = new xmldoc.XmlDocument(this.escapeContents(fs.readFileSync(templatePath, 'utf-8')));

  //   const getIndentation = (node: xmldoc.XmlNode) => {
  //     if (node.type !== 'text') {
  //       return '';
  //     }

  //     const pos = node.text.lastIndexOf('\n');
  //     const indent = node.text.substring(pos + 1);
  //     const newline = (pos > 0 && node.text[pos - 1] === '\r') ? node.text.substring(pos - 1, pos + 1) : node.text.substring(pos, pos + 1);
  //     return newline + indent;
  //   };

  //   Loca.executeOnTexts(english, (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => {
  //     if (guid && texts && texts[guid]) {
  //       // previous translation found
  //       textNode.text = texts[guid].text;
  //       const comments = texts[guid].comments;
  //       if (comments) {
  //         parentElement.children.splice(1, 0, 
  //           ...comments.flatMap(e => [
  //             new xmldoc.XmlCommentNode(e), new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])) 
  //           ])
  //         );
  //       }
  //     }
  //     else if (guid && textElement) {
  //       // valid new text
  //       // const position = parentElement.children.indexOf(textElement);
  //       parentElement.children.splice(1, 0, 
  //         new xmldoc.XmlCommentNode(" TODO translation "),
  //         new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])));
  //     }
  //   });

  //   // this.recursiveUpdateTexts(english, texts);
  //   let content = english.toString({ compressed: true, preserveWhitespace: true, html: false });

  //   // xmldoc automatically escapes texts, but we want the original text there
  //   content = this.unescapeAll(content);

  //   // update includes
  //   const language = path.basename(targetPath, path.extname(targetPath));
  //   content = content.replace(/texts_english/g, language);

  //   // give me space before />
  //   content = content.replace(/[^\s](\/>)/g, (match) => match.replace('\/>', ' \/>'));

  //   fs.writeFileSync(targetPath, content, 'utf-8');
  // }

  static recursiveUpdateTexts(node: xmldoc.XmlNode, texts?: Loca.Texts) {
    if (node.type !== 'element') {
      return;
    }

    if (node.name === 'Text' || node.name === 'ModOp') {
      const guid = node.childNamed('GUID')?.val ?? Loca.getModOpGuid(node);
      const textNode = node.childNamed('Text');
      const text = textNode?.children[0];

      if (guid && text?.type === 'text' && texts && texts[guid]) {
        // previous translation found
        text.text = texts[guid].text;
      }
      else if (guid && textNode) {
        // valid new text
        const position = node.children.indexOf(textNode);
        node.children.splice(position, 0, 
          new xmldoc.XmlCommentNode(" TODO translation "));
      }
    }
    
    if (node.name !== 'Text') {
      for (const child of node.children) {
        this.recursiveUpdateTexts(child, texts);
      }
    }
  }

  // static escapeContents(content: string) {
  //   const regex = /<Text>([^<]*)<\/Text>/g;

  //   return content.replace(regex, (match, capture1) => {
  //     const before = match;
  //     const after = match.replace(capture1, this.escapeXML(capture1));
  //     if (before.indexOf('Buildable on') >= 0 || before.indexOf('可建造在') >= 0) {
  //       channel.error(`${before} -> ${after}`);
  //     }
      
  //     return after;
  //   });
  // }

  // static unescapeAll(content: string) {
  //   return content
  //     .replace(/&lt;/g, "<")
  //     .replace(/&gt;/g, ">")
  //     .replace(/&apos;/g, "'")
  //     .replace(/&quot;/g, "\"")
  //     .replace(/&amp;/g, "&");
  // }
}
