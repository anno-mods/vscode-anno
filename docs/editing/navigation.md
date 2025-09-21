# Navigation

![](./images/navigation.gif)

## Jump to Asset

Right click on any GUID and select `Go to Definition` or press ++f12++ to jump to the related mod or vanilla asset.

The plugin searches in the following locations for assets:

- Vanilla assets ([configure path](../setup.md#configure-path))
- Current mod
- Dependencies found in the workspace or in the mods folder ([configure path](../setup.md#configure-path))
- Any XML patch opened once during current session

!!! tip "Press ++ctrl++ + ++t++ to search and quickly jump to an asset."

## Outline

![](./images/outline.png){ width="300" align="right" }

The plugin has custom outlines for ModOp patches and CFG & IFO files.

Clicking on an outline entry navigates the cursor to the according position in the document.

!!! tip "Open Outline"
    Press ++ctrl++ +  ++alt++ + ++b++ and go to the tab `Outline`.

    Or alternatively, ++ctrl++ + ++shift++ + ++o++ to just jump to a section.

<div style="clear: both;"></div>

### Naming Sections

=== "Code"
    ```xml
    <ModOps>
      <!-- # Section 1 -->
      <Group />
      <ModOp Type="Add"/>

      <!-- # Section 2 -->
      <ModOp Type="Remove"/>
    </ModOps>
    ```
=== "Result"
    ![](./images/outline-named-section.png){ width="500" }

### Naming Groups

=== "Code"
    ```xml
    <ModOps>
      <Group />

      <!-- This group has a name -->
      <Group />
    </ModOp>
    ```
=== "Result"
    ![](./images/outline-named-group.png){ width="500" }