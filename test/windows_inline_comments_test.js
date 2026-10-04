const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const fixtures = require('./fixtures/inline_comments.json');

const generator = path.resolve(__dirname, '../windows/code/generate-header.js');

for (const fixture of fixtures) {
  test(`Windows codegen: ${fixture.key}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnc-comment-'));
    try {
      fs.writeFileSync(path.join(root, '.env'), fixture.line + '\n');
      const out = path.join(root, 'out');
      fs.mkdirSync(out);
      execFileSync(process.execPath, [generator, path.join(root, 'native'), out], {
        env: { ...process.env, ENVFILE: '.env' },
        stdio: 'pipe',
      });
      const header = fs.readFileSync(path.join(out, 'Generated Files/RNCConfigValues.h'), 'utf8');
      const assignment = header.split('\n').find(line => line.includes(`std::string ${fixture.key} = `));
      assert.ok(assignment, 'constant was generated');
      const literal = assignment.slice(assignment.indexOf(' = ') + 3, -1);
      assert.equal(JSON.parse(literal), fixture.value);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test('generated C++ constants preserve the fixture values', (t) => {
  try {
    execFileSync('clang++', ['--version'], { stdio: 'pipe' });
  } catch {
    t.skip('clang++ is unavailable');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rnc-constants-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), fixtures.map(fixture => fixture.line).join('\n'));
    const out = path.join(root, 'out');
    fs.mkdirSync(out);
    execFileSync(process.execPath, [generator, path.join(root, 'native'), out], {
      env: { ...process.env, ENVFILE: '.env' },
      stdio: 'pipe',
    });
    const main = path.join(root, 'main.cpp');
    fs.writeFileSync(main, [
      '#include <iostream>',
      '#include "RNCConfigValues.h"',
      'int main() {',
      ...fixtures.map(fixture => `std::cout << ReactNativeConfig::${fixture.key} << "\\n";`),
      '}',
    ].join('\n'));
    const executable = path.join(root, process.platform === 'win32' ? 'constants.exe' : 'constants');
    execFileSync('clang++', ['-std=c++17', '-Werror', '-I', path.join(out, 'Generated Files'), main, '-o', executable], {
      stdio: 'pipe',
    });
    const actual = execFileSync(executable, { encoding: 'utf8' }).replace(/\r\n/g, '\n').split('\n');
    assert.equal(actual.pop(), '');
    assert.deepEqual(actual, fixtures.map(fixture => fixture.value));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
