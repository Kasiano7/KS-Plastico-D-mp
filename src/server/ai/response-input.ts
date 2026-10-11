import type {
  ResponseInputItem,
  ResponseOutputItem,
} from 'openai/resources/responses/responses';

/**
 * Le SDK ajoute des champs pratiques après `responses.parse()`. Ces champs ne
 * font pas partie du contrat d'entrée de l'API et doivent être retirés avant
 * de rejouer la sortie du modèle dans un tour d'appel d'outil.
 */
export function toResponseInputItems(
  output: readonly ResponseOutputItem[],
): ResponseInputItem[] {
  return output.map((item) => {
    if (item.type === 'function_call') {
      const call = { ...item } as typeof item & {
        parsed_arguments?: unknown;
      };
      delete call.parsed_arguments;
      return call;
    }

    if (item.type === 'message') {
      return {
        ...item,
        content: item.content.map((content) => {
          if (content.type !== 'output_text') return content;
          const text = { ...content } as typeof content & {
            parsed?: unknown;
          };
          delete text.parsed;
          return text;
        }),
      };
    }

    return item as ResponseInputItem;
  });
}
