# Detailed Setup

## How to open files

Most features only activate if you a open folder (e.g. `File` > `Open Folder...`) that includes one or more full mods (detected by `modinfo.json`).

You can also work with parent folders, or your complete `mods/` folder.

## Path configurations

Go into `File` > `Preferences` > `Settings` and search for `anno` to configure the following:

### Anno 117

- `Anno.117: Game Path`: Path to your Anno installation.

  This can be either your normal game installation, with 'bin\win64\Anno117.exe'.

  E.g. *'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117'*.

  Alternatively, it can be where you extracted all RDA files using the [RDAExplorer](https://github.com/lysannschlegel/RDAExplorer).

  E.g. *'C:\\anno\\all-rda'* if you have
  *'c:\\anno\\all-rda\\data\\base\\config\\export\\assets.xml'* in that location.

- `Anno.117: Mods Folder`: Path to your `mods/` folder to deploy and resolve dependencies.

  Defaults to *'&lt;Game Path&gt;/mods/'*.

### Anno 1800

- `Anno: Rda Folder`: Path to your extracted RDA data.

  Set it to where you extracted all RDA files using the [RDAExplorer](https://github.com/lysannschlegel/RDAExplorer).

  E.g. *'C:\\anno\\all-rda'* if you have
  *'c:\anno\all-rda\data\config\export\main\asset\assets.xml'* in that location.

- `Anno: Mods Folder`: Path to your `mods/` folder to deploy and resolve dependencies.

## Syntax Check and Auto Complete

The below features are set up for you by default, unless you change their settings.

You can change a setting by going to `File` > `Preferences` > `Settings` and then search for the settings key.

### Modinfo.json Schema

The modinfo.json schema enables auto complete and syntax check.

It is automatically added your workspace settings file `.vscode/settings.json`, unless you deactivate it under `anno.workspace.setModinfoSchema`.

By default, it has the following content:

```json
"json.schemas": [
  {
    "fileMatch": [
      "/modinfo.json"
    ],
    "url": "https://raw.githubusercontent.com/anno-mods/vscode-anno-modding-tools/main/languages/modinfo-schema.json"
  }
]
```

### XML Patch Schema

The XML patch schema enables partial auto complete and syntax check for XML ModOp patches.

It is automatically added your workspace settings file `.vscode/settings.json`, unless you deactivate it under `anno.workspace.setXmlSchema`.

By default, it has the following content:

```json
"xml.fileAssociations": [
  {
    "pattern": "{assets*,*.include}.xml",
    "systemId": "https://raw.githubusercontent.com/anno-mods/vscode-anno-modding-tools/main/generated/assets.xsd"
  }
]
```

You need to install the [XML Language Support by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml) extension.

*Note: If you want to force updates for auto-completion delete 'C:\\Users\\<user>\\.lemminx' and re-open VSCode.*

## Recommended Plugins

### XML

In Anno 1800 mode, auto completion and other XML features work only in combination with a plugin that supports XSD validation.

[XML Language Support by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-xml)

### glTF Tools

There's a plugin that can preview glTF models which can be useful if you work with the glTF based Blender import/export tools.

[glTF Tools](https://marketplace.visualstudio.com/items?itemName=cesium.gltf-vscode)
