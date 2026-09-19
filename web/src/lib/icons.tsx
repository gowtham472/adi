import {
  ArchiveIcon,
  ArrowsSplitIcon,
  BroadcastIcon,
  CloudIcon,
  CrosshairIcon,
  CubeIcon,
  DatabaseIcon,
  FileCodeIcon,
  GitDiffIcon,
  GlobeIcon,
  GraphIcon,
  BookOpenIcon,
  ListChecksIcon,
  InfoIcon,
  KeyIcon,
  LightningIcon,
  LinkSimpleIcon,
  NotebookIcon,
  PlugsIcon,
  PathIcon,
  ScrollIcon,
  SealCheckIcon,
  SealQuestionIcon,
  SealWarningIcon,
  ShieldCheckIcon,
  SignpostIcon,
  SquaresFourIcon,
  StackIcon,
  TableIcon,
  TrayIcon,
  WarningIcon,
  WarningCircleIcon,
  WarningOctagonIcon,
  type Icon,
  type IconProps,
} from '@phosphor-icons/react';
import type { EvidenceSource, Severity, VerificationStatus } from '@adi/engine/types';

const RESOURCE_ICONS: Readonly<Record<string, Icon>> = {
  'AWS::EC2::VPC': CloudIcon,
  'AWS::EC2::Subnet': SquaresFourIcon,
  'AWS::EC2::InternetGateway': GlobeIcon,
  'AWS::EC2::VPCGatewayAttachment': PlugsIcon,
  'AWS::EC2::RouteTable': PathIcon,
  'AWS::EC2::Route': SignpostIcon,
  'AWS::EC2::SubnetRouteTableAssociation': LinkSimpleIcon,
  'AWS::EC2::SecurityGroup': ShieldCheckIcon,
  'AWS::EC2::SecurityGroupIngress': ShieldCheckIcon,
  'AWS::RDS::DBInstance': DatabaseIcon,
  'AWS::RDS::DBCluster': DatabaseIcon,
  'AWS::RDS::DBSubnetGroup': StackIcon,
  'AWS::ElasticLoadBalancingV2::LoadBalancer': ArrowsSplitIcon,
  'AWS::ElasticLoadBalancingV2::TargetGroup': CrosshairIcon,
  'AWS::ElasticLoadBalancingV2::Listener': BroadcastIcon,
  'AWS::ECS::Cluster': StackIcon,
  'AWS::ECS::TaskDefinition': FileCodeIcon,
  'AWS::ECS::Service': CubeIcon,
  'AWS::IAM::Role': KeyIcon,
  'AWS::IAM::Policy': ScrollIcon,
  'AWS::IAM::ManagedPolicy': ScrollIcon,
  'AWS::Logs::LogGroup': NotebookIcon,
  'AWS::Lambda::Function': LightningIcon,
  'AWS::DynamoDB::Table': TableIcon,
  'AWS::S3::Bucket': ArchiveIcon,
  'AWS::SQS::Queue': TrayIcon,
};

/**
 * Resource types with an official AWS Architecture Icon, served from public/aws-icons. The
 * icons are drawn as masks in the current text colour, so graph state colours apply to them.
 * Types AWS publishes no resource icon for, such as security groups, keep a generic glyph
 * rather than borrowing an icon for a different resource.
 */
const AWS_ICONS: Readonly<Record<string, string>> = {
  'AWS::EC2::VPC': 'vpc',
  'AWS::EC2::InternetGateway': 'internet-gateway',
  'AWS::EC2::VPCGatewayAttachment': 'internet-gateway',
  'AWS::EC2::RouteTable': 'router',
  'AWS::EC2::Route': 'router',
  'AWS::EC2::SubnetRouteTableAssociation': 'router',
  'AWS::RDS::DBInstance': 'rds-instance',
  'AWS::RDS::DBCluster': 'rds-instance',
  'AWS::ElasticLoadBalancingV2::LoadBalancer': 'application-load-balancer',
  'AWS::ECS::TaskDefinition': 'ecs-task',
  'AWS::ECS::Service': 'ecs-service',
  'AWS::IAM::Role': 'iam-role',
  'AWS::IAM::Policy': 'iam-permissions',
  'AWS::IAM::ManagedPolicy': 'iam-permissions',
  'AWS::Logs::LogGroup': 'cloudwatch-logs',
  'AWS::Lambda::Function': 'lambda-function',
  'AWS::DynamoDB::Table': 'dynamodb-table',
  'AWS::S3::Bucket': 's3-bucket',
  'AWS::SQS::Queue': 'sqs-queue',
};

/** The icon for a CloudFormation resource type, with a cube for types without one. */
export function ResourceGlyph({ type, className, ...props }: { type: string } & IconProps) {
  const icon = AWS_ICONS[type];
  if (icon !== undefined) {
    const url = `url("${import.meta.env.BASE_URL}aws-icons/${icon}.svg")`;
    return (
      <span
        className={['aws-glyph', className].filter(Boolean).join(' ')}
        style={{ maskImage: url, WebkitMaskImage: url }}
        aria-hidden="true"
      />
    );
  }
  const Glyph = RESOURCE_ICONS[type] ?? CubeIcon;
  return <Glyph className={className} {...props} />;
}

export const EVIDENCE_ICONS: Readonly<Record<EvidenceSource, Icon>> = {
  DIFF: GitDiffIcon,
  GRAPH: GraphIcon,
  TEMPLATE: FileCodeIcon,
  CHANGE_SET: ListChecksIcon,
  AWS_DOCUMENTATION: BookOpenIcon,
};

export const EVIDENCE_LABELS: Readonly<Record<EvidenceSource, string>> = {
  DIFF: 'Diff',
  GRAPH: 'Graph',
  TEMPLATE: 'Template',
  CHANGE_SET: 'Change set',
  AWS_DOCUMENTATION: 'AWS docs',
};

export const SEVERITY_ICONS: Readonly<Record<Severity, Icon>> = {
  CRITICAL: WarningOctagonIcon,
  HIGH: WarningIcon,
  MEDIUM: WarningCircleIcon,
  LOW: InfoIcon,
};

export const STATUS_ICONS: Readonly<Record<VerificationStatus, Icon>> = {
  MATCHED: SealCheckIcon,
  UNCONFIRMED: SealQuestionIcon,
  CONTRADICTED: SealWarningIcon,
};
