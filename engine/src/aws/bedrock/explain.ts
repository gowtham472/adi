import type { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import type { Explanation, Finding } from '../../types/index.ts';
import { describeModelError } from './errors.ts';
import { buildFindingsPayload, SYSTEM_PROMPT } from './prompt.ts';
import { ExplanationRejected, validateExplanation } from './validate.ts';

export type MessagesClient = Pick<AnthropicBedrockMantle, 'messages'>;

/**
 * Asks the model to explain findings the engine already produced, then validates the
 * answer. Any failure surfaces as an error for the caller to record; the deterministic
 * findings are never altered by this step.
 */
export async function explainFindings(
  client: MessagesClient,
  model: string,
  findings: readonly Finding[],
  resourceIds: readonly string[],
): Promise<Explanation> {
  const response = await client.messages
    .create({
      model,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: buildFindingsPayload(findings) }],
    })
    .catch((error: unknown) => {
      throw new Error(describeModelError(error), { cause: error });
    });

  if (response.stop_reason === 'refusal') {
    throw new ExplanationRejected('The model declined to explain these findings');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new ExplanationRejected('The explanation was cut off at the token limit');
  }

  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  return { ...validateExplanation(text, findings, resourceIds), model };
}
