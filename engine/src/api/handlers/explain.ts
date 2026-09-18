import { createDependencies } from '../dependencies.ts';
import { explainAnalysis, type ServiceDependencies } from '../service.ts';

let dependencies: ServiceDependencies | undefined;

/** Invoked asynchronously by the API function after an analysis with findings is stored. */
export async function handler(event: { analysisId?: unknown }): Promise<void> {
  if (typeof event.analysisId !== 'string') {
    console.error('Explain invoked without an analysisId', event);
    return;
  }
  dependencies ??= createDependencies();
  await explainAnalysis(dependencies, event.analysisId);
}
