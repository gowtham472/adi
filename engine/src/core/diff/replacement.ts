/**
 * Properties whose modification forces CloudFormation to replace the physical resource,
 * taken from the "Update requires: Replacement" entries in the CloudFormation template
 * reference. Only resource types that have been checked against the documentation are
 * listed. For any other type the engine reports replacement as unknown rather than guess.
 *
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-rds-dbinstance.html
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-ec2-securitygroup.html
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-elasticloadbalancingv2-targetgroup.html
 */
export const REPLACEMENT_PROPERTIES: Readonly<Record<string, ReadonlySet<string>>> = {
  'AWS::RDS::DBInstance': new Set([
    'BackupTarget',
    'CharacterSetName',
    'CustomIAMInstanceProfile',
    'DBClusterIdentifier',
    'DBInstanceIdentifier',
    'DBName',
    'DBSubnetGroupName',
    'DBSystemId',
    'KmsKeyId',
    'MasterUsername',
    'NcharCharacterSetName',
    'SourceRegion',
    'StorageEncrypted',
    'Timezone',
  ]),
  'AWS::EC2::SecurityGroup': new Set(['GroupDescription', 'GroupName', 'VpcId']),
  'AWS::ElasticLoadBalancingV2::TargetGroup': new Set([
    'IpAddressType',
    'Name',
    'Port',
    'Protocol',
    'ProtocolVersion',
    'TargetType',
    'VpcId',
  ]),
};
