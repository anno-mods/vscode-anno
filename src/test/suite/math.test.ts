import * as assert from 'assert';

import { Vector, Quaternion } from '../../generic/math';

suite('math tests', () => {
  test('quaternion rotation', async () => {
    const origPos = new Vector(1, 2, 3);
    const noRotation = Quaternion.default;

    assert.deepStrictEqual(origPos, origPos.rotate(noRotation));
  });
});
