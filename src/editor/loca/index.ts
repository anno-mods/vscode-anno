import * as xmldoc from 'xmldoc';
import * as fs from 'fs';
import * as path from 'path';
import * as channel from '../../features/channel';

export namespace Loca {

  export type Text = { text: string, comments?: string[] };
  export type Texts = { [index: string]: Text };
  export const LANGUAGES = [ "chinese", "english", "french", "german", "italian", "japanese", "korean", "polish", "russian", "spanish", "taiwanese" ];

  export function readTextsFromFile(filePath: string, insert?: Loca.Texts): Loca.Texts {
    const result: Loca.Texts = insert ?? {};

    const doc = new xmldoc.XmlDocument(
      escapeContents(fs.readFileSync(filePath, 'utf-8')));

    executeOnTexts(doc, (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => {
      const text: Loca.Text = { text: textNode.text };
      for (const node of parentElement.children) {
        if (node.type === 'comment' && node.comment.includes('TODO')) {
          text.comments = [...(text.comments ?? []), node.comment];
        }
      }

      if (result[guid] && result[guid].text !== text.text) {
        channel.warn(`translation mismatch for GUID ${guid}: ${result[guid].text} <> ${text.text}`);
      }
      result[guid] = text;
    });

    return result;
  }

  export function updateTexts(templatePath: string, targetPath: string, texts?: Loca.Texts) {
    const english = new xmldoc.XmlDocument(escapeContents(fs.readFileSync(templatePath, 'utf-8')));

    const getIndentation = (node: xmldoc.XmlNode) => {
      if (node.type !== 'text') {
        return '';
      }

      const pos = node.text.lastIndexOf('\n');
      const indent = node.text.substring(pos + 1);
      const newline = (pos > 0 && node.text[pos - 1] === '\r') ? node.text.substring(pos - 1, pos + 1) : node.text.substring(pos, pos + 1);
      return newline + indent;
    };

    Loca.executeOnTexts(english, (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => {
      if (guid && texts && texts[guid]) {
        // previous translation found
        textNode.text = texts[guid].text;
        const comments = texts[guid].comments;
        if (comments) {
          parentElement.children.splice(1, 0, 
            ...comments.flatMap(e => [
              new xmldoc.XmlCommentNode(e), new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])) 
            ])
          );
        }
      }
      else if (guid && textElement) {
        // valid new text
        // const position = parentElement.children.indexOf(textElement);
        parentElement.children.splice(1, 0, 
          new xmldoc.XmlCommentNode(" TODO translation "),
          new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])));
      }
    });

    // this.recursiveUpdateTexts(english, texts);
    let content = english.toString({ compressed: true, preserveWhitespace: true, html: false });

    // xmldoc automatically escapes texts, but we want the original text there
    content = unescapeAll(content);

    // update includes
    const language = path.basename(targetPath, path.extname(targetPath));
    content = content.replace(/texts_english/g, language);

    // give me space before />
    content = content.replace(/[^\s](\/>)/g, (match) => match.replace('\/>', ' \/>'));

    fs.writeFileSync(targetPath, content, 'utf-8');
  }

  export function importTexts(templatePath: string, targetPath: string, texts?: Loca.Texts) : number {
    let importCount = 0;

    if (!texts) {
      return importCount;
    }

    const english = new xmldoc.XmlDocument(escapeContents(fs.readFileSync(templatePath, 'utf-8')));

    // const getIndentation = (node: xmldoc.XmlNode) => {
    //   if (node.type !== 'text') {
    //     return '';
    //   }

    //   const pos = node.text.lastIndexOf('\n');
    //   const indent = node.text.substring(pos + 1);
    //   const newline = (pos > 0 && node.text[pos - 1] === '\r') ? node.text.substring(pos - 1, pos + 1) : node.text.substring(pos, pos + 1);
    //   return newline + indent;
    // };

    Loca.executeOnTexts(english, (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => {
      if (guid && texts[guid]) {
        // translation available
        if (textNode.text !== texts[guid].text) {
          textNode.text = texts[guid].text;
          importCount++;
        }

        // TODO remove TODO comments
        // const comments = texts[guid].comments;
        // if (comments) {
        //   parentElement.children.splice(1, 0, 
        //     ...comments.flatMap(e => [
        //       new xmldoc.XmlCommentNode(e), new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])) 
        //     ])
        //   );
        // }
      }
      // else if (guid && textElement) {
      //   // valid new text
      //   // const position = parentElement.children.indexOf(textElement);
      //   parentElement.children.splice(1, 0, 
      //     new xmldoc.XmlCommentNode(" TODO translation "),
      //     new xmldoc.XmlTextNode(getIndentation(parentElement.children[0])));
      // }
    });

    // this.recursiveUpdateTexts(english, texts);
    let content = english.toString({ compressed: true, preserveWhitespace: true, html: false });

    // xmldoc automatically escapes texts, but we want the original text there
    content = unescapeAll(content);

    // update includes
    // TODO
    const language = path.basename(targetPath, path.extname(targetPath));
    content = content.replace(/texts_english/g, language);

    // give me space before />
    content = content.replace(/[^\s](\/>)/g, (match) => match.replace('\/>', ' \/>'));

    fs.writeFileSync(targetPath, content, 'utf-8');

    return importCount;
  }

  export function executeOnTexts(node: xmldoc.XmlNode,
    execute: (guid: string, textNode: xmldoc.XmlTextNode, textElement: xmldoc.XmlElement, parentElement: xmldoc.XmlElement) => void) {
    if (node.type !== 'element') {
      return;
    }

    if (node.name === 'Text' || node.name === 'ModOp') {
      const guid = node.childNamed('GUID')?.val ?? getModOpGuid(node);
      const textNode = node.childNamed('Text');
      const text = textNode?.children[0];

      if (guid && text && text.type === 'text') {
        execute(guid, text, textNode, node);
      }
    }

    if (node.type === 'element' && node.name !== 'Text') {
      for (const child of node.children) {
        executeOnTexts(child, execute);
      }
    }
  }

  export function getModOpGuid(node: xmldoc.XmlElement) {
    const pathAttr = node.attr.Path;
    if (!pathAttr) {
      return undefined;
    }
    const match = pathAttr.match(/\[GUID='(\d+)'\]/);
    if (match && match.length > 1) {
      return match[1];
    }

    return undefined;
  }

  function escapeContents(content: string) {
    const regex = /<Text>([^<]*)<\/Text>/g;

    return content.replace(regex, (match, capture1) => {
      const before = match;
      const after = match.replace(capture1, escapeXML(capture1));
      if (before.indexOf('Buildable on') >= 0 || before.indexOf('可建造在') >= 0) {
        channel.error(`${before} -> ${after}`);
      }

      return after;
    });
  }

  function unescapeAll(content: string) {
    return content
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/&amp;/g, "&");
  }

  function escapeXML(value: string) {
    return value
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "&apos;")
      .replace(/"/g, "&quot;");
  }
}