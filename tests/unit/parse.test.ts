import { describe, expect, it } from 'vitest';
import { parseTemplate, TemplateParseError } from '../../engine/src/aws/cloudformation/parse.ts';

describe('parseTemplate', () => {
  it('expands short form intrinsics to their long form', () => {
    const template = parseTemplate(`
Resources:
  Queue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub '\${AWS::StackName}-jobs'
      Tags:
        - Key: owner
          Value: !Ref Owner
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt DeadLetter.Arn
      Joined: !Join ['', [!Ref Owner, '-suffix']]
`);
    expect(template.Resources['Queue']?.Properties).toEqual({
      QueueName: { 'Fn::Sub': '${AWS::StackName}-jobs' },
      Tags: [{ Key: 'owner', Value: { Ref: 'Owner' } }],
      RedrivePolicy: { deadLetterTargetArn: { 'Fn::GetAtt': ['DeadLetter', 'Arn'] } },
      Joined: { 'Fn::Join': ['', [{ Ref: 'Owner' }, '-suffix']] },
    });
  });

  it('splits a short form GetAtt on the first dot only', () => {
    const template = parseTemplate(`
Resources:
  Task:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Host: !GetAtt Database.Endpoint.Address
`);
    expect(template.Resources['Task']?.Properties?.['Host']).toEqual({
      'Fn::GetAtt': ['Database', 'Endpoint.Address'],
    });
  });

  it('parses JSON templates with the same parser', () => {
    const template = parseTemplate(
      JSON.stringify({ Resources: { Bucket: { Type: 'AWS::S3::Bucket' } } }),
    );
    expect(template.Resources['Bucket']?.Type).toBe('AWS::S3::Bucket');
  });

  it('rejects a template without resources', () => {
    expect(() => parseTemplate('Description: empty')).toThrow(TemplateParseError);
  });

  it('rejects a resource without a type', () => {
    expect(() => parseTemplate('Resources:\n  Broken:\n    Properties: {}')).toThrow(
      /must be an object with a string Type/,
    );
  });

  it('rejects malformed YAML with a parse error rather than a crash', () => {
    expect(() => parseTemplate('Resources: [unclosed')).toThrow(TemplateParseError);
  });

  it('rejects duplicate keys, which CloudFormation also rejects', () => {
    expect(() =>
      parseTemplate('Resources:\n  A:\n    Type: AWS::S3::Bucket\n  A:\n    Type: AWS::S3::Bucket'),
    ).toThrow(TemplateParseError);
  });
});
