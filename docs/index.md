# Anno Modding Tools

<div class="grid cards" markdown>
-   [__Get Started__](./get-started.md) with the plugin.
-   [__Report an Issue__](https://github.com/anno-mods/vscode-anno/issues) or make feature requests.
</div>

## Features

### Navigation and IntelliSense

  - Outline: Navigate with Anno-specific outlines.<br/>
    _Secondary Side Bar or `Ctrl+Shift+O`_
  - Annotations: Inline asset name display next to GUIDs
  - Definitions: Jump to asset (vanilla or modded).<br/>
    _`Ctrl+T` > type name; or right click on GUID > `Go to Definition`_
  - Name to GUID conversion and auto GUID counter. _`Ctrl+Space`_
  - XML auto completion (only Anno 1800)

### [Syntax and Error Checking](./error-checking.md)

  - Modinfo.json syntax analysis
  - XML syntax analysis using Red Hat XML (only Anno 1800)
  - Live patch error and performance analysis
  - Missing filename check

### [Utilities](./utilities.md)

  - Templates: Create empty mod from templates.<br/>
    _`F1` or right click folder in explorer > `Anno: Create Mod from Template`_
  - Show Diff: Compare original and patched result.<br/>
    _Right click in text editor or explorer > `Show Diff`_
  - Deploy Mod: Copy to `mods/` folder and generate DDS (with LODs) and other files automatically.<br/>_Status Bar > click on `Anno 1800/117: ModID` button_

### [Model and Texture Utilities](./model-texture-utils.md)

  - Convert to and from Anno specific file formats (DDS <> PNG, RDM <> glTF, ...).<br/>_Right click in explorer > `Anno: Convert to ...`_
  - Import from Blender glTF to `.cfg`, `.ifo` and `.cf7`.<br/>_Right click in explorer > `Anno: Import from ...`_
  - Reskin existing models without touching `.cfg`, ... (only Anno 1800)
