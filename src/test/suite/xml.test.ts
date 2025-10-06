import * as assert from 'assert';
import AnnoXml, { AnnoXmlElement } from '../../utils/annoXml';


suite('xml tests', () => {
  test('append', async () => {
    const parent = AnnoXml.fromString('<parent></parent>').findElement('//parent');
    assert(parent);

    parent.createChild('child');
    assert.strictEqual(parent.toString(),
`<parent>
  <child></child>
</parent>`);
  });

  test('insert after', async () => {
    const parent = AnnoXml.fromString('<parent></parent>').findElement('//parent');
    assert(parent);

    parent.createChild('a');
    parent.createChild('b');
    parent.createChild('aftera', { after: [ 'aftera', 'a' ] });
    parent.createChild('afteraa', { after: [ 'aftera', 'a' ] });
    parent.createChild('afterlast', { after: [ 'b' ] });
    parent.createChild('afternotfound', { after: [ 'notavailable' ]});
    assert.strictEqual(parent.toString(),
`<parent>
  <a></a>
  <aftera></aftera>
  <afteraa></afteraa>
  <b></b>
  <afterlast></afterlast>
  <afternotfound></afternotfound>
</parent>`);
  });

  test('remove', async () => {
    const xml = AnnoXml.fromString(
`<parent>
  <remove></remove>
  <a></a>
  <remove></remove>
  <b></b>
  <remove></remove>
</parent>`);
    assert(xml);

    xml.remove('//parent/remove', { all: true });

    assert.strictEqual(xml.toString(),
`<parent>
  <a></a>
  <b></b>
</parent>`);
});

  test('remove chained', async () => {
    const xml = AnnoXml.fromString(
`<parent>
  <remove></remove>
  <remove></remove>
  <a></a>
  <b></b>
  <remove></remove>
</parent>`);
    assert(xml);

    xml.remove('//parent/remove', { all: true });

    assert.strictEqual(xml.toString(),
`<parent>
  <a></a>
  <b></b>
</parent>`);
  });

  test('remove added', async () => {
      const xml = AnnoXml.fromString(
`<parent>
  <a></a>
  <b></b>
</parent>`);
      assert(xml);
  
      const parent = xml.findElement('//parent');
      parent?.createChild('remove', { after: ['a']});
      parent?.createChild('remove', { after: ['b']});
      assert.strictEqual(parent?.toString(),
`<parent>
  <a></a>
  <remove></remove>
  <b></b>
  <remove></remove>
</parent>`);

      xml.remove('//parent/remove', { all: true });
  
      assert.strictEqual(xml.toString(),
`<parent>
  <a></a>
  <b></b>
</parent>`);
  });
});
