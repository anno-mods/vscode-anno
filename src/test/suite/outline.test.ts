import * as assert from 'assert';

import { AssetsTocProvider } from '../../languages/xml/assetsTocProvider';
import { AssetsDocument } from '../../anno/xml';

const text = `<ModOps>
  <ModOp Type="add">
    <Asset>
      <Template>Template1</Template>
      <Values>
        <Standard>
          <GUID>123</GUID>
          <Name>Name2</Name>
        </Standard>
      </Values>
    </Asset>
  </ModOp>
</ModOps>`;

suite('outline tests', () => {
  test('template names', async () => {

    const provider = new AssetsTocProvider(AssetsDocument.from(text));
    const toc = provider.getToc();

    assert.strictEqual(toc ? toc[1].text : undefined, "add");
    assert.strictEqual(toc ? toc[2].text : undefined, "Template1");
    assert.strictEqual(toc ? toc[2].guid : undefined, "123");
  });

  test('section comments', async () => {
    const text = `<ModOps>
      <!-- # Section 1 -->
      <ModOp Type="add" />
      <!-- # Section 2 -->
      <Group />
      <!-- # Section 3 -->
      <Include />
    </ModOps>`;

    const provider = new AssetsTocProvider(AssetsDocument.from(text));
    const toc = provider.getToc();

    assert.strictEqual(toc ? toc[0].text : undefined, "Section 1");
    assert.strictEqual(toc ? toc[1].text : undefined, "add");
    assert.strictEqual(toc ? toc[2].text : undefined, "Section 2");
    assert.strictEqual(toc ? toc[3].text : undefined, "Section 3");
    assert.strictEqual(toc ? toc[4].text : undefined, "Include");
  });

  test('sub-section comments', async () => {
    const text = `<ModOps>
      <!-- # Lists -->
      <Group>
        <!-- After Coats -->
        <Group />
        <!-- After Furs -->
        <Group />
      </Group>
    </ModOps>`;

    const provider = new AssetsTocProvider(AssetsDocument.from(text));
    const toc = provider.getToc();

    assert.strictEqual(toc ? toc[0].text : undefined, "Lists");
    assert.strictEqual(toc ? toc[1].text : undefined, "After Coats");
    assert.strictEqual(toc ? toc[2].text : undefined, "After Furs");
  });
});
