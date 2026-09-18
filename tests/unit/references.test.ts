import { describe, expect, it } from 'vitest';
import { extractReferences } from '../../engine/src/core/graph/references.ts';

const RESOURCES = new Set(['Database', 'Queue', 'Role']);

describe('extractReferences', () => {
  it('reports Ref and GetAtt with the property path where they appear', () => {
    const references = extractReferences(
      {
        Role: { 'Fn::GetAtt': ['Role', 'Arn'] },
        Environment: [{ Name: 'QUEUE', Value: { Ref: 'Queue' } }],
      },
      RESOURCES,
    );
    expect(references).toEqual([
      { target: 'Role', kind: 'GetAtt', propertyPath: 'Role', attribute: 'Arn' },
      { target: 'Queue', kind: 'Ref', propertyPath: 'Environment[0].Value' },
    ]);
  });

  it('ignores parameters and pseudo parameters', () => {
    expect(
      extractReferences({ A: { Ref: 'AWS::Region' }, B: { Ref: 'SomeParameter' } }, RESOURCES),
    ).toEqual([]);
  });

  it('reads resource tokens from Fn::Sub strings and skips escaped and pseudo tokens', () => {
    const references = extractReferences(
      { Url: { 'Fn::Sub': 'postgres://${Database.Endpoint.Address}/${AWS::Region}/${!Queue}' } },
      RESOURCES,
    );
    expect(references).toEqual([
      { target: 'Database', kind: 'Sub', propertyPath: 'Url', attribute: 'Endpoint.Address' },
    ]);
  });

  it('lets Fn::Sub variable names shadow resources and still reads the variable values', () => {
    const references = extractReferences(
      { Value: { 'Fn::Sub': ['${Queue}-${Role}', { Queue: { Ref: 'Database' } }] } },
      RESOURCES,
    );
    expect(references).toEqual([
      { target: 'Role', kind: 'Sub', propertyPath: 'Value' },
      { target: 'Database', kind: 'Ref', propertyPath: 'Value' },
    ]);
  });

  it('reports references inside other intrinsics at the enclosing property', () => {
    const references = extractReferences(
      { Name: { 'Fn::Join': ['-', [{ Ref: 'Queue' }, 'x']] } },
      RESOURCES,
    );
    expect(references).toEqual([{ target: 'Queue', kind: 'Ref', propertyPath: 'Name' }]);
  });
});
