import * as vscode from 'vscode';

export function registerFormatter(language: string): vscode.Disposable {
  return vscode.languages.registerDocumentFormattingEditProvider({ language, scheme: 'file' }, { provideDocumentFormattingEdits });
}

async function provideDocumentFormattingEdits(document: vscode.TextDocument) {
  const originalText = document.getText();

  var formatted = "";
  var tagDepth = 0;

  var comment = false;
  var tagOpen = false;
  var closingTag = false;
  var attributePadding = 0;

  for (var i = 0; i < document.lineCount; i++) {
    const lineUntrimmed = document.lineAt(i).text;
    const line = lineUntrimmed.trim();

    var singleQuote = false;
    var doubleQuote = false;
    var padding = tagDepth * 2;

    const wasOpen = tagOpen;

    for (var x = 0; x < line.length; x++) {
      const char = line.charAt(x);
      var firstAttribute = tagOpen ? attributePadding : line.length + 1;

      if (comment && char === '>') {
        if (x >= 2 && line.substring(x - 2, x) === '--') {
          comment = false;
        }
      }
      else if (comment) {
        // ignore
      }
      else if (char === '<') {
        if (line.substring(x + 1, x + 4) === '!--') {
          comment = true;
        }
        else {
          tagOpen = true;
          closingTag = false;
          firstAttribute = line.length + 1;
        }
      }
      else if (char === '/' && tagOpen && line.charAt(x - 1) === '<') {
        closingTag = true;
      }
      else if (char === '>') {
        tagOpen = false;
        if (line.charAt(x - 1) === '/') {
          // self closing
        }
        else if (closingTag) {
          tagDepth --;
          padding = tagDepth * 2;
        }
        else {
          tagDepth ++;
        }
      }
      else if (tagOpen) {
        if (char === '\'') {
          singleQuote = !singleQuote;
        }
        else if (char === '\"') {
          doubleQuote = !doubleQuote;
        }
        else if (char === ' ' && firstAttribute > x + 1) {
          firstAttribute = x + 1;
        }
      }

      attributePadding = firstAttribute;
    }

    if (comment) {
      formatted += lineUntrimmed + "\n";
    }
    else if (line.length === 0) {
      formatted += "\n";
    }
    else if (wasOpen) {
      formatted += line.padStart(line.length + padding + attributePadding, ' ') + "\n";
    }
    else {
      formatted += line.padStart(line.length + padding, ' ') + "\n";
    }
  }

  const range = new vscode.Range(
    document.positionAt(0),
    document.positionAt(originalText.length)
  );

  return [vscode.TextEdit.replace(range, formatted)];
}
