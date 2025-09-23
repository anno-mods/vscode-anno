import * as fs from 'fs';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import { Converter } from '../Converter';

export class ModinfoConverter extends Converter {
  public getName() {
    return 'modinfo';
  }

  public async run(files: string[], sourceFolder: string, outFolder: string, options: {
    modJson: any,
    converterOptions: any }) {

    const targetFile = path.join(outFolder, "modinfo.json");

    try {
      if (!fs.existsSync(path.dirname(targetFile))) {
        fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      }

      // deep copy since we modify it
      const modinfo = jsonc.parse(JSON.stringify(options.modJson));

      // remove some build specific things
      modinfo.bundle = undefined;
      modinfo.src = undefined;
      modinfo.out = undefined;
      modinfo.converter = undefined;
      modinfo.Development = undefined;

      // defaults
      modinfo.Description = modinfo.Description ?? { "English" : "file::README.md" };
      modinfo.Description.English = modinfo.Description.English ?? "file::README.md";

      // Category/ModName/Descriptions, fill other languages based on English
      const languages = [ "Chinese", "French", "German", "Italian", "Japanese", "Korean", "Polish", "Russian", "Spanish", "Taiwanese" ];
      for (let lang of languages) {
        modinfo.Category[lang] ??= modinfo.Category.English;
        modinfo.ModName[lang] ??= modinfo.ModName.English;
        modinfo.Description[lang] ??= modinfo.Description.English;
      }

      // content_en.txt
      if (options.converterOptions.content_en && modinfo.Description.English) {
        const contentEnPath = path.join(path.dirname(targetFile), 'content_en.txt');
        fs.writeFileSync(contentEnPath, modinfo.Description.English);
        this._logger.log(`  <= content_en.txt`);
      }
      // remove \r (after writing content_en.txt)
      for (let lang of [...languages, 'English']) {
        if (modinfo.Description[lang]) {
          modinfo.Description[lang] = modinfo.Description[lang].replace(/\r/g, '');
        }
      }

      const image = this._createBase64Image(sourceFolder, "base64.jpg");
      if (image) {
        modinfo.Image = image;
      }

      fs.writeFileSync(targetFile, JSON.stringify(modinfo, null, 2));
      this._logger.log(`  <= modinfo.json`);
    }
    catch (exception: any)
    {
      this._logger.error(exception.message);
      return false;
    }
    return true;
  }

  private _readMarkdownWithoutImages(sourceFolder: string, filePath: string) {
    if (!filePath) {
      return null;
    }
    const descFile = path.join(sourceFolder, filePath);
    let content = filePath;
    if (fs.existsSync(descFile)) {
      content = fs.readFileSync(descFile).toString();
      content = content.replace(/!\[\]\([^)]+\)\r?\n?\r?\n?/g, '');
    }
    return content;
  }

  private _createBase64Image(sourceFolder: string, sourceImage?: string): string | null {
    if (!sourceImage) {
      return null;
    }

    const filePath = path.join(sourceFolder, sourceImage);
    if (!fs.existsSync(filePath)) {
      this._logger.log(`  no base64 image at ${filePath}`);
      return null; // be silent
    }

    const buffer = fs.readFileSync(filePath);
    if (!buffer) {
      this._logger.error(`  error reading ${filePath}`);
      return null;
    }

    return "data:image/jpeg;base64," + buffer.toString('base64');
  }
}
