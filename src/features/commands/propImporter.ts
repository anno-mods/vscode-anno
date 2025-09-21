import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as xmldoc from 'xmldoc';
import ProppedModel, { PROP_DEFAULTS, PROPCONTAINER_DEFAULTS, FILE_DEFAULTS, FILES_DEFAULTS } from '../../generic/proppedModel';
import AnnoXml from '../../generic/annoXml';
import * as channel from '../channel';

export class PropImporter {
  insertPropContainer: xmldoc.XmlElement | undefined = undefined;

	public static register(context: vscode.ExtensionContext) {
    const disposable = [
      vscode.commands.registerCommand('anno-modding-tools.importProps', async (fileUri) => {
        const modelFile = PropImporter._findModelFile(fileUri.fsPath);

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
          PropImporter.commandImportProps(fileUri.fsPath, openUri[0].fsPath);
        }
      })
    ];

    return disposable;
	}

  public static commandImportProps(cfgFilePath: string, gltfFilePath: string) {
    const importer = new PropImporter();
    const model = ProppedModel.fromFile(gltfFilePath);
    const xml = AnnoXml.fromFile(cfgFilePath);

    channel.show();
    channel.log(`Import from ${path.basename(gltfFilePath)} into ${path.basename(cfgFilePath)}`);

    importer.importProps(xml, model);
    importer.importParticles(xml, model);
    importer.importDecals(xml, model);
    importer.importFiles(xml, model);

    fs.writeFileSync(cfgFilePath, xml.toString());
    channel.log(`<= ${cfgFilePath}`);
  }

  public importProps(xml: AnnoXml, model: ProppedModel) {
    xml.ensureSection('Config.PropContainers.Config.Props', [ 
      { }, // Config
      { position: 'Models:after' }, // PropContainers
      { defaults: PROPCONTAINER_DEFAULTS }, 
      { }
    ]);

    this._importConfig(xml, model.getProps(), '//Config/PropContainers/Config/Props', 'PROP', 'prop_', PROP_DEFAULTS, (name: string) => model.getProp(name));

    // // update existing and add new props
    // for (let prop of model.getProps()) {
    //   channel.log(`Import PROP ${prop.Name}`);
    //   xml.setValue(prop.Name, prop, { insert: '//Config/PropContainers/Config/Props', defaults: PROP_DEFAULTS });
    // }
    // // mark removed props
    // for (let name of xml.getNodeNames((e) => e.startsWith('prop_'))) {
    //   if (!model.getProp(name) && !name.endsWith('_removed')) {
    //     channel.log(`Mark PROP ${name} as removed`);
    //     // eslint-disable-next-line @typescript-eslint/naming-convention
    //     xml.setValue(name, { Name: name + '_removed' });
    //   }
    // }
  }

  public importParticles(xml: AnnoXml, model: ProppedModel) {
    // update existing particles
    for (let particle of model.getParticles()) {
      channel.log(`Update PARTICLE ${particle.Name} Transformer`);

      // this will fetch the first Transformer occurence with Conditions=0
      const path = `/Config/Particles/Config[Name='${particle.Name}']/Transformer/Config[ConfigType='ORIENTATION_TRANSFORM' and Conditions='0']`;
      // TODO create node if necessary
      xml.set(path, particle.Transformer.Config);
    }
  }

  public importFiles(xml: AnnoXml, model: ProppedModel) {
    xml.ensureSection('Config.Files', [ 
      { }, // Config
      { // Files
        position: 'MeshRadius:after',
        defaults: FILES_DEFAULTS
      },
    ]);

    this._importConfig(xml, model.getFiles(), '//Config/Files', 'FILE', 'file_', FILE_DEFAULTS, (name: string) => model.getFile(name));

    // // update existing and add new files
    // for (let file of model.getFiles()) {
    //   // this will fetch the first Transformer occurence with Conditions=0
    //   const path = `//Config/Files/Config[Name='${file.Name}']`;
    //   const element = xml.findElement(path, { silent: true });
    //   if (element) {
    //     channel.log(`Update FILE ${file.Name}`);
    //     element.set(file, { defaults: FILE_DEFAULTS });
    //   }
    //   else {
    //     channel.log(`Add FILE ${file.Name}`);
    //     const parent = xml.findElement(`//Config/Files`); 
    //     if (parent) {
    //       parent.createChild('Config').set(file, { defaults: FILE_DEFAULTS });
    //     }
    //     else {
    //       console.error(`ensureSection should have created //Config/Files`);
    //     }
    //   }
    // }
    // // mark removed files
    // for (let name of xml.getNodeNames((e) => e.startsWith('file_'))) {
    //   if (!model.getFile(name) && !name.endsWith('_removed')) {
    //     channel.log(`Mark FILE ${name} as removed`);
    //     // eslint-disable-next-line @typescript-eslint/naming-convention
    //     xml.setValue(name, { Name: name + '_removed' });
    //   }
    // }
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  private _importConfig(xml: AnnoXml, items: { Name: string }[], sectionPath: string, type: string, prefix: string, 
    defaults: any, getCallback: (name: string) => any) {

    // update existing and add new files
    for (let item of items) {
      // this will fetch the first Transformer occurence with Conditions=0
      const path = `${sectionPath}/Config[Name='${item.Name}']`;
      const element = xml.findElement(path, { silent: true });
      if (element) {
        channel.log(`Update ${type} ${item.Name}`);
        element.set(item, { defaults });
      }
      else {
        channel.log(`Add ${type} ${item.Name}`);
        const parent = xml.findElement(sectionPath); 
        if (parent) {
          parent.createChild('Config').set(item, { defaults });
        }
        else {
          console.error(`ensureSection should have created ${sectionPath}`);
        }
      }
    }
    // mark removed files
    for (let name of xml.getNodeNames((e) => e.startsWith(prefix))) {
      if (!getCallback(name) && !name.endsWith('_removed')) {
        channel.log(`Mark ${type} ${name} as removed`);
        // eslint-disable-next-line @typescript-eslint/naming-convention
        xml.setValue(name, { Name: name + '_removed' });
      }
    }
  }

  public importDecals(xml: AnnoXml, model: ProppedModel) {
    const decal = model.getDecalExtends();
    if (decal) {
      channel.log(`Update DECAL Extents from node/mesh 'ground'`);

      const path = `/Config/Decals/Config[ConfigType='DECAL']`;
      // don't create, just update
      // TODO only create when ground has texture
      xml.set(path, decal);
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