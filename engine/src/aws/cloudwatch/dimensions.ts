/**
 * Converts the physical identifier CloudFormation reports for a resource into the value a
 * CloudWatch dimension expects.
 *
 * Application Load Balancer metrics take the final portion of the ARN, for example
 * `app/my-load-balancer/50dc6c495c0c9188` and `targetgroup/my-targets/73e2d6bc24d8a067`.
 * https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-cloudwatch-metrics.html
 *
 * The physical ID of an ECS service is its ARN, while the ServiceName dimension is the
 * service name, the last segment of that ARN.
 */
export function dimensionValue(dimension: string, physicalId: string): string {
  switch (dimension) {
    case 'LoadBalancer':
      return afterMarker(physicalId, ':loadbalancer/');
    case 'TargetGroup':
      return afterMarker(physicalId, ':targetgroup/', 'targetgroup/');
    case 'ServiceName':
      return physicalId.startsWith('arn:') ? (physicalId.split('/').pop() ?? physicalId) : physicalId;
    default:
      return physicalId;
  }
}

function afterMarker(value: string, marker: string, prefix = ''): string {
  const index = value.indexOf(marker);
  return index === -1 ? value : `${prefix}${value.slice(index + marker.length)}`;
}
