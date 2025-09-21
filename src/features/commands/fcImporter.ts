import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as xmldoc from 'xmldoc';
import ProppedModel from '../../generic/proppedModel';
import AnnoXml from '../../generic/annoXml';
import * as channel from '../channel';

export class FcImporter {
  insertPropContainer: xmldoc.XmlElement | undefined = undefined;

	public static register(context: vscode.ExtensionContext) {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.importFeedback', async (fileUri) => {
        const modelFile = FcImporter._findModelFile(fileUri.fsPath);

        const options: vscode.OpenDialogOptions = {
          canSelectMany: false,
          defaultUri: modelFile ? vscode.Uri.file(modelFile) : undefined,
          openLabel: 'Import',
          filters: {
              'glTF': ['gltf']
          }
        };

        let openUri = await vscode.window.showOpenDialog(options);
        if (openUri && openUri[0]) {
          FcImporter.commandImportFeedback(fileUri.fsPath, openUri[0].fsPath); 
        }
      })
    ];

    return disposable;
	}

  public static commandImportFeedback(cfgFilePath: string, gltfFilePath: string) {
    const importer = new FcImporter();
    const model = ProppedModel.fromFile(gltfFilePath);
    const xml = AnnoXml.fromFile(cfgFilePath);

    channel.show();
    channel.log(`Import from ${path.basename(gltfFilePath)} into ${path.basename(cfgFilePath)}`);

    importer.importFeedback(xml, model);

    fs.writeFileSync(cfgFilePath, xml.toString());
  }

  public importFeedback(xml: AnnoXml, model: ProppedModel) {
    // update existing particles
    for (let feedback of model.getFeedbacks()) {
      const dotIndex = feedback.Name.lastIndexOf('.');
      const feedbackName = feedback.Name.substring(3, dotIndex === -1 ? undefined : dotIndex);

      channel.log(`Import feedback ${feedbackName} position and orientation`);
      const path = `//DummyRoot/Groups/i/Dummies/i[Name=${feedbackName}]`;
      const element = xml.findElement(path, { silent: true }) || xml.findElement(`//DummyRoot/Dummies/i[Name=${feedbackName}]`);
      if (element) {
        element.findElement('//Position')?.set(feedback.Position);
        element.findElement('//Orientation')?.set(feedback.Orientation);
        /* eslint-disable-next-line @typescript-eslint/naming-convention */
        element.set({ RotationY: feedback.RotationY });
      }
    }
  }

  private static _findModelFile(cfgFilePath: string) {
    const dirname = path.dirname(cfgFilePath);
    const basename = path.basename(cfgFilePath, '.cfg');
    
    // look for samename.gltf in either same folder or rdm/ folder
    let modelFile = path.join(dirname, basename + '.gltf');
    if (!fs.existsSync(modelFile)) {
      modelFile = path.join(dirname, 'rdm', basename + '.gltf');
    }
    if (!fs.existsSync(modelFile)) {
      return undefined;
    }

    return modelFile;
  }
}