# Anno Modding Tools

Tools to create mods for Anno 1800 and Anno 117: Pax Romana.

> [!IMPORTANT]
> [Documentation](https://anno-mods.github.io/vscode-anno)
>
> Also checkout the tutorials and guides in the [community modding guide](https://github.com/anno-mods/modding-guide#readme).

## Feature Overview

See also the [CHANGELOG](./CHANGELOG.md) for recent changes.

### [Navigation and IntelliSense](https://anno-mods.github.io/vscode-anno/intellisense.md)

  - Outline: Navigate with Anno-specific outlines.<br/>
    _Secondary Side Bar or `Ctrl+Shift+O`_
  - Annotations: Inline asset name display next to GUIDs
  - Definitions: Jump to asset (vanilla or modded).<br/>
    _`Ctrl+T` > type name; or right click on GUID > `Go to Definition`_
  - Name to GUID conversion and auto GUID counter. _`Ctrl+Space`_
  - XML auto completion (only Anno 1800)

### [Syntax and Error Checking](https://anno-mods.github.io/vscode-anno/error-checking.md)

  - Modinfo.json syntax analysis
  - XML syntax analysis using Red Hat XML (only Anno 1800)
  - Live patch error and performance analysis
  - Missing filename check

### [Utilities](https://anno-mods.github.io/vscode-anno/utilities.md)

  - Templates: Create empty mod from templates.<br/>
    _`F1` or right click folder in explorer > `Anno: Create Mod from Template`_
  - Show Diff: Compare original and patched result.<br/>
    _Right click in text editor or explorer > `Show Diff`_
  - Deploy Mod: Copy to `mods/` folder and generate DDS (with LODs) and other files automatically.<br/>_Status Bar > click on `Anno 1800/117: ModID` button_

### [Model and Texture Utilities](https://anno-mods.github.io/vscode-anno/model-texture-utils.md)

  - Convert to and from Anno specific file formats (DDS <> PNG, RDM <> glTF, ...).<br/>_Right click in explorer > `Anno: Convert to ...`_
  - Import from Blender glTF to `.cfg`, `.ifo` and `.cf7`.<br/>_Right click in explorer > `Anno: Import from ...`_
  - Reskin existing models without touching `.cfg`, ... (only Anno 1800)


## Quick Setup

See also the [Setup](https://anno-mods.github.io/vscode-anno/setup.md) page for detailed documentation.

### How to open files

Most features only activate if you a open folder (e.g. `File` > `Open Folder...`) that includes one or more full mods (detected by `modinfo.json`).

You can also work with parent folders, or your complete `mods/` folder.

### Check configuration

Go into `File` > `Preferences` > `Settings` and search for `anno` to configure the following:

- `Anno.*: Game Path`: Path to your Anno installation.

  E.g. *'C:\\Program Files (x86)\\Ubisoft\\Ubisoft Game Launcher\\games\\Anno 117'*.

## Credits

This is a personal project and not an official product of Ubisoft.
Anno is a trademark of Ubisoft Entertainment in the US and/or other countries.

Special thanks go to the original author of the modloader:

- https://github.com/magicalcookie/anno1800-mod-loader

Big thanks go to the external projects I'm using for this extension:

- AnnoFCConverter - https://github.com/taubenangriff/AnnoFCConverter/
- annotex - forked from https://github.com/richgel999/bc7enc_rdo
- FileDBReader - https://github.com/anno-mods/FileDBReader
- gltf-import-export - https://github.com/najadojo/gltf-import-export
- RDAConsole - https://github.com/anno-mods/RdaConsole
- rdm4 - https://github.com/lukts30/rdm4
- xmltest - https://github.com/jakobharder/anno-mod-loader
