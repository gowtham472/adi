import { describe, expect, it } from 'vitest';
import { compareTemplates, deepEqual } from '../../engine/src/core/diff/compare.ts';
import type { CfnTemplate } from '../../engine/src/types/index.ts';

function template(resources: CfnTemplate['Resources']): CfnTemplate {
  return { Resources: resources };
}

describe('compareTemplates', () => {
  it('reports no changes for identical templates', () => {
    const t = template({ Bucket: { Type: 'AWS::S3::Bucket', Properties: { A: [1, { b: 2 }] } } });
    expect(compareTemplates(t, t).changes).toEqual([]);
  });

  it('classifies creations and deletions', () => {
    const { changes } = compareTemplates(
      template({ Old: { Type: 'AWS::S3::Bucket' } }),
      template({ New: { Type: 'AWS::S3::Bucket' } }),
    );
    expect(changes.map((c) => [c.resourceId, c.action])).toEqual([
      ['New', 'CREATE'],
      ['Old', 'DELETE'],
    ]);
  });

  it('reports an in place update when no documented replacement property changed', () => {
    const { changes } = compareTemplates(
      template({ Sg: { Type: 'AWS::EC2::SecurityGroup', Properties: { SecurityGroupIngress: [] } } }),
      template({
        Sg: { Type: 'AWS::EC2::SecurityGroup', Properties: { SecurityGroupIngress: [{ FromPort: 1 }] } },
      }),
    );
    expect(changes[0]).toMatchObject({
      action: 'UPDATE',
      replacement: 'NOT_REQUIRED',
      changedProperties: ['SecurityGroupIngress'],
    });
  });

  it('reports replacement with its cause when a documented property changed', () => {
    const { changes } = compareTemplates(
      template({ Db: { Type: 'AWS::RDS::DBInstance', Properties: { DBName: 'a', DBInstanceClass: 'x' } } }),
      template({ Db: { Type: 'AWS::RDS::DBInstance', Properties: { DBName: 'b', DBInstanceClass: 'y' } } }),
    );
    expect(changes[0]).toMatchObject({
      action: 'REPLACE',
      replacement: 'REQUIRED',
      changedProperties: ['DBInstanceClass', 'DBName'],
      replacementCauses: ['DBName'],
    });
  });

  it('reports replacement as unknown for types outside the documented table', () => {
    const { changes } = compareTemplates(
      template({ Fn: { Type: 'AWS::Lambda::Function', Properties: { MemorySize: 128 } } }),
      template({ Fn: { Type: 'AWS::Lambda::Function', Properties: { MemorySize: 256 } } }),
    );
    expect(changes[0]).toMatchObject({ action: 'UPDATE', replacement: 'UNKNOWN' });
  });

  it('treats a type change as a replacement', () => {
    const { changes } = compareTemplates(
      template({ Store: { Type: 'AWS::S3::Bucket' } }),
      template({ Store: { Type: 'AWS::DynamoDB::Table' } }),
    );
    expect(changes[0]).toMatchObject({ action: 'REPLACE', replacementCauses: ['Type'] });
  });
});

describe('deepEqual', () => {
  it('is order sensitive for arrays and insensitive for object keys', () => {
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(deepEqual([], {})).toBe(false);
  });
});
