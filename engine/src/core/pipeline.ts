import type { AnalysisResult, CfnTemplate } from '../types/index.ts';
import { compareTemplates } from './diff/compare.ts';
import { buildDependencyGraph, mergeGraphs } from './graph/build.ts';
import { GraphIndex } from './graph/query.ts';
import { propagateChanges } from './impact/propagate.ts';
import { evaluateRules } from './rules/registry.ts';
import type { RuleContext } from './rules/rule.ts';

/**
 * Runs the deterministic analysis: diff, graph, impact and rules. The result contains
 * nothing produced by a model and is identical for identical inputs.
 */
export function analyzeTemplates(current: CfnTemplate, proposed: CfnTemplate): AnalysisResult {
  const currentGraph = buildDependencyGraph(current);
  const proposedGraph = buildDependencyGraph(proposed);
  const graph = mergeGraphs(currentGraph, proposedGraph);
  const index = new GraphIndex(graph);
  const currentIndex = new GraphIndex(currentGraph);
  const proposedIndex = new GraphIndex(proposedGraph);

  const changeSet = compareTemplates(current, proposed);
  const impacts = propagateChanges(index, changeSet);
  const impactById = new Map(impacts.map((impact) => [impact.resourceId, impact]));

  const contexts: RuleContext[] = changeSet.changes.map((change) => ({
    change,
    impact: impactById.get(change.resourceId),
    graph: index,
    current: currentIndex,
    proposed: proposedIndex,
    currentTemplate: current,
    proposedTemplate: proposed,
  }));

  return { graph, changeSet, impacts, findings: evaluateRules(contexts) };
}
