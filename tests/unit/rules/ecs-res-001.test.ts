import { describe, expect, it } from 'vitest';
import { analyzeTemplates } from '../../../engine/src/core/pipeline.ts';
import { BASELINE_TEMPLATE_PATH, editBaseline, loadTemplate, propertiesOf } from '../../helpers.ts';

const baseline = loadTemplate(BASELINE_TEMPLATE_PATH);

function findingFor(edit: Parameters<typeof editBaseline>[0]) {
  return analyzeTemplates(baseline, editBaseline(edit)).findings.find((f) => f.ruleId === 'ECS-RES-001');
}

describe('ECS-RES-001', () => {
  it('stays silent when resources increase', () => {
    expect(
      findingFor((t) => {
        propertiesOf(t, 'TaskDefinition')['Memory'] = '2048';
      }),
    ).toBeUndefined();
  });

  it('reports a CPU reduction with the CPU utilization signal', () => {
    const current = editBaseline((t) => {
      propertiesOf(t, 'TaskDefinition')['Cpu'] = '512';
    });
    const finding = analyzeTemplates(current, baseline).findings.find((f) => f.ruleId === 'ECS-RES-001');
    expect(finding?.title).toBe('CPU for TaskDefinition is reduced from 512 to 256');
    expect(finding?.verificationSignals.map((s) => (s.kind === 'METRIC' ? s.metricName : ''))).toEqual([
      'CPUUtilization',
    ]);
  });

  it('matches containers by name for container level reductions', () => {
    const withContainerMemory = (memory: number) =>
      editBaseline((t) => {
        const [container] = propertiesOf(t, 'TaskDefinition')['ContainerDefinitions'] as Record<string, unknown>[];
        if (container !== undefined) {
          container['MemoryReservation'] = memory;
        }
      });
    const finding = analyzeTemplates(withContainerMemory(512), withContainerMemory(256)).findings.find(
      (f) => f.ruleId === 'ECS-RES-001',
    );
    expect(finding?.evidence[0]?.fact).toBe('ContainerDefinitions[api].MemoryReservation is reduced from 512 to 256');
  });
});
