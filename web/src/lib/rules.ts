/**
 * The rule catalog shown on the Rules page. It mirrors README section 4; the rules
 * themselves live in engine/src/core/rules, and each has a scenario of the same number.
 */
export interface RuleEntry {
  readonly id: string;
  readonly name: string;
  readonly resourceType: string;
  readonly trigger: string;
  readonly severity: string;
  readonly signals: string;
  readonly insight: string;
  readonly exampleId: string;
}

export const RULES: readonly RuleEntry[] = [
  {
    id: 'NET-SG-001',
    name: 'Lost network access',
    resourceType: 'AWS::EC2::SecurityGroup',
    trigger: 'An ingress permission is removed or narrowed so the proposed template no longer allows it.',
    severity: 'HIGH when a consumer in the source group depends on the protected resource, otherwise MEDIUM',
    signals: 'RDS DatabaseConnections falls, target HTTPCode_Target_5XX_Count rises',
    insight: 'Security groups do not cut tracked connections, so the failure appears as connections recycle.',
    exampleId: '01-rds-security-group',
  },
  {
    id: 'IAM-POL-001',
    name: 'Removed permission',
    resourceType: 'AWS::IAM::Role',
    trigger: 'A permission or managed policy is removed from a role that a resource in the stack assumes.',
    severity: 'HIGH',
    signals: 'Healthy targets fall for ECS execution roles, AccessDenied in logs for task roles, Errors for Lambda',
    insight: 'An ECS execution role is used when a task launches, so running tasks keep working.',
    exampleId: '02-iam-policy-removal',
  },
  {
    id: 'ALB-HC-001',
    name: 'Health check change',
    resourceType: 'AWS::ElasticLoadBalancingV2::TargetGroup',
    trigger: 'A target group health check setting changes.',
    severity: 'HIGH when the targets security group blocks the new port, otherwise MEDIUM',
    signals: 'UnHealthyHostCount rises, HealthyHostCount falls',
    insight: 'A load balancer fails open when every target is unhealthy, so client errors are not a reliable signal.',
    exampleId: '03-alb-health-check',
  },
  {
    id: 'ECS-RES-001',
    name: 'Reduced capacity',
    resourceType: 'AWS::ECS::TaskDefinition',
    trigger: 'Task or container CPU or memory is reduced.',
    severity: 'MEDIUM',
    signals: 'ECS MemoryUtilization or CPUUtilization rises',
    insight: 'The template cannot show actual usage, so this prediction may not hold and verification says so.',
    exampleId: '04-ecs-memory-reduction',
  },
  {
    id: 'RDS-REP-001',
    name: 'Database replacement',
    resourceType: 'AWS::RDS::DBInstance',
    trigger: 'A DB instance property documented as requiring replacement changes.',
    severity: 'CRITICAL',
    signals: 'RDS DatabaseConnections falls, target HTTPCode_Target_5XX_Count rises',
    insight: 'Without an UpdateReplacePolicy, CloudFormation deletes the replaced instance and its data.',
    exampleId: '05-rds-replacement',
  },
  {
    id: 'DEP-ORPH-001',
    name: 'Stranded dependents',
    resourceType: 'AWS::ElasticLoadBalancingV2::Listener',
    trigger: 'A resource is deleted while surviving resources depend on it, or a target group loses its last listener.',
    severity: 'HIGH',
    signals: 'Target group RequestCount falls, or failure signals of the dependents',
    insight: 'A remaining reference makes CloudFormation reject the template before anything deploys.',
    exampleId: '06-orphaned-reference',
  },
];
