// Deterministic serialisation for the build's outputs: JSON with one record per line, so a rebuild
// diffs line by line, and Markdown formatted by the repository's Prettier settings, so the generated
// pages pass the format check unchanged.

import { format, resolveConfig } from 'prettier';

// Render an object whose values are scalars, small objects or lists of records: each list element
// goes on its own line, and everything else stays compact.
export function renderJson(value: Record<string, unknown>): string {
  const entries = Object.entries(value).map(([key, item]) => {
    if (Array.isArray(item)) {
      const lines = item.map((record) => `    ${JSON.stringify(record)}`);
      return `  ${JSON.stringify(key)}: [\n${lines.join(',\n')}\n  ]`;
    }
    return `  ${JSON.stringify(key)}: ${JSON.stringify(item)}`;
  });
  return `{\n${entries.join(',\n')}\n}\n`;
}

export async function formatMarkdown(markdown: string, path: string): Promise<string> {
  const options = (await resolveConfig(path)) ?? {};
  return format(markdown, { ...options, parser: 'markdown', filepath: path });
}

// A Markdown table from a header and rows, escaping the pipes a cell's text may hold.
export function table(header: string[], rows: string[][]): string {
  const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${header.map(cell).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}
