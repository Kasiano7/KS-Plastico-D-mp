import type { ResponseOutputItem } from 'openai/resources/responses/responses';
import { describe, expect, it } from 'vitest';
import { toResponseInputItems } from '../response-input';

describe('rejeu des sorties Responses API', () => {
  it('retire les arguments parsés ajoutés par le SDK aux appels de fonction', () => {
    const output = [
      {
        type: 'function_call',
        id: 'fc_123',
        call_id: 'call_123',
        name: 'get_machine_status',
        arguments: '{"query":"Presse 04"}',
        parsed_arguments: { query: 'Presse 04' },
        status: 'completed',
      },
    ] as unknown as ResponseOutputItem[];

    expect(toResponseInputItems(output)).toEqual([
      {
        type: 'function_call',
        id: 'fc_123',
        call_id: 'call_123',
        name: 'get_machine_status',
        arguments: '{"query":"Presse 04"}',
        status: 'completed',
      },
    ]);
  });

  it('retire aussi le contenu parsé ajouté aux messages', () => {
    const output = [
      {
        type: 'message',
        id: 'msg_123',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: '{"answer":"ok"}',
            annotations: [],
            logprobs: [],
            parsed: { answer: 'ok' },
          },
        ],
      },
    ] as unknown as ResponseOutputItem[];

    expect(toResponseInputItems(output)).toEqual([
      {
        type: 'message',
        id: 'msg_123',
        role: 'assistant',
        status: 'completed',
        content: [
          {
            type: 'output_text',
            text: '{"answer":"ok"}',
            annotations: [],
            logprobs: [],
          },
        ],
      },
    ]);
  });
});
