# Model and Texture Utils

## Import from Blender or glTF

Steps:

1. Follow naming conventions below
2. Export to glTF
3. Right-click on target `.cfg` and select `Import from glTF`.

Import an glTF file from one of the below examples into Blender to see how a project should look like:

- [Town Hall Buildings](https://github.com/jakobharder/anno1800-city-variations/tree/main/sub/skin-townhall) (multiple models in one .cfg)
- [Small Power Plants](https://github.com/jakobharder/anno1800-jakobs-mods/tree/main/sub/jakob-power-plants) (with animations)

⚠ Make sure to not edit the mesh of the objects, but the object position, scale and rotation only.

CFG file imports:

- `PROP`s with prefix `prop_` *(e.g. boxes, barrels)*
  - Position, Rotation, Scale
  - mesh name as `FileName` if it ends with `.prp`.
    Don't worry about Blender-style `.001`, `.002`, ... endings. They will be ignored.
  - Will be added if they don't exist.
- `PARTICLE`s with prefix `particle_` *(e.g. smoke)*
  - Position, Rotation, Scale
- `FILE`s with prefix `file_` *(included external cfg files)*
  - Position, Rotation, Scale
  - mesh name as `FileName` if it ends with `.cfg`.
  - Will be added if they don't exist.
- `DECAL` with name `ground` *(ground texture)*
  - Extents is calculated from all vertices of that object (e.g. plane).
    This modifies the ground texture. The building tile size is `<BuildBlocker>` in the IFO file.

Entries not existing in the model will be marked as `_removed` and not removed automatically.

CF7 file imports:

- `<Dummies><i>`: people, FireDummy, feedback_door, ...
  - Imported from multiple objects with prefix `fc_`.
  - `Position` and `Orientation` are taken from the object.
    `RotationY` is calculated from the orientation.
  - `<Name>` of the entry will be matched against what comes after `fc_`.
    E.g. `fc_Dummy0` will be matched against `<Name>Dummy0</Name>`.
  - Entries not existing in the model will not be removed.

IFO file imports:

- `<IntersectBox>`: clickable 3D area (aka hitbox) of the building
  - Imported from multiple mesh object (e.g. cube) with prefix `hitbox`
  - `Position`, `Rotation` and `Extents` are calculated from the boundaries of the objects.
    1 box per object.
- `<Dummy>`: transporter spawn, fire locations, ...
  - Imported from multiple objects with prefix `dummy_`.
  - `Position`, `Rotation` and `Extents` are taken from the object.
  - `<Name>` of the entry will be matched against what comes after `dummy_`.
    E.g. `dummy_transporter_spawn` will be matched against `<Name>transporter_spawn</Name>`.
  - Entries not existing in the model will not be removed.
- `<FeedbackBlocker>`: area people can walk through
  - Imported from multiple mesh objects (e.g. plane) with prefix `FeedbackBlocker`
  - `Position`s are taken from mesh vertices.
    Rounded to .25
- `<BuildBlocker>`: tile size of the building
  - Imported from one mesh object (e.g. plane) with name `ground`
  - `Position`s are taken from mesh vertices.
    Rounded to .5
- `<UnevenBlocker>`: area to always keep above ground
  - Imported from one mesh object (e.g. plane) with name `UnevenBlocker`
  - `Position`s are taken from mesh vertices.
    Rounded **up** in .25 steps

## Quickly Reskin Existing Models

Write a yaml file like below and name it `.cfg.yaml`.
IFO, FC/CF7 and CFG files will be generated accordingly.
Files are copied if they have the same name as the source.
Modifications are currently only supported in IFO and CFG files.

If you have `townhall.cfg`, `townhall.cf7` and `townhall.ifo`, then a `townhall_1.cfg.yaml` leads to generated `townhall_1.cfg`, `townhall_1.fc` and `townhall_1.ifo`.

Examples: [Town Hall Buildings](https://github.com/jakobharder/anno1800-city-variations/tree/main/sub/skin-townhall)

```yaml
variant:
  source: townhall.cfg
  modifications:
    - xpath: //Config/Models/Config/Materials/Config[Name="building"]
      cModelDiffTex: data/jakob/buildings/townhall/maps/townhall_bluish_diff.psd
    - xpath: //Config/Models/Config[Name="top"]
      FileName: data/jakob/buildings/townhall/rdm/townhall_2_lod0.rdm
    # disable smoke
    - xpath-remove: //Config/Particles/Config[Name="particle_smoke1"]
    # move flag 1
    - xpath: //Config/Files/Config[Name="file_flag1"]/Transformer/Config
      Position.y: 6.97816
  ifo:
    # adjust hitbox to new height
    - xpath: //Info/IntersectBox[Name="Hitbox2"]
      Position:
        yf: 4.34346
```