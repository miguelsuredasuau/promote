import { expect, it } from 'vitest';
import { exportedFile } from '../server/container-runner';
function entry(type: string, data: string) {
  const header = Buffer.alloc(512);
  header.write('../../host-secret'); // Never used as a filesystem path.
  header.write(data.length.toString(8).padStart(11, '0'), 124);
  header.write(type, 156);
  return Buffer.concat([header, Buffer.from(data), Buffer.alloc((512-data.length%512)%512)]);
}
it('returns bytes without extracting candidate paths', () => {
  expect(exportedFile(entry('0', 'package'), 100).toString()).toBe('package');
});
it('rejects symlinks, directories, oversized output and multiple files', () => {
  for (const type of ['1','2','5']) expect(() => exportedFile(entry(type, 'x'),100)).toThrow('type');
  expect(() => exportedFile(entry('0','too big'),2)).toThrow('size_limit');
  expect(() => exportedFile(Buffer.concat([entry('0','a'),entry('0','b')]),100)).toThrow('multiple');
  expect(() => exportedFile(entry('0','abc').subarray(0,514),100)).toThrow('size_limit');
});
it('handles Docker PAX metadata without interpreting paths', () => {
  expect(exportedFile(Buffer.concat([entry('x','ignored'),entry('0','ok')]),100).toString()).toBe('ok');
});
