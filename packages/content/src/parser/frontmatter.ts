/**
 * Frontmatter parser
 * Parses YAML/JSON key-values between `---` fences.
 */

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

export function extractFrontmatter(source: string): ParsedFrontmatter {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith('---')) {
    return { data: {}, content: source };
  }

  const endFenceIndex = trimmed.indexOf('\n---', 3);
  if (endFenceIndex === -1) {
    return { data: {}, content: source };
  }

  const rawYaml = trimmed.slice(3, endFenceIndex).trim();
  const rawContent = trimmed.slice(endFenceIndex + 4).replace(/^\r?\n/, '');

  const data: Record<string, unknown> = {};
  const lines = rawYaml.split(/\r?\n/);

  let currentKey: string | null = null;
  let currentArray: unknown[] | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;

    // Check array item
    if (trimmedLine.startsWith('- ') && currentKey && currentArray) {
      const itemVal = parseScalar(trimmedLine.slice(2).trim());
      currentArray.push(itemVal);
      continue;
    }

    // Check key-value pair
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmedLine.slice(0, colonIndex).trim();
      const valStr = trimmedLine.slice(colonIndex + 1).trim();

      if (valStr === '') {
        // May start a multi-line array
        currentKey = key;
        currentArray = [];
        data[key] = currentArray;
      } else {
        currentKey = null;
        currentArray = null;
        data[key] = parseScalar(valStr);
      }
    }
  }

  return { data, content: rawContent };
}

function parseScalar(val: string): unknown {
  // Check quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }

  // Booleans
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;
  if (val.toLowerCase() === 'null') return null;

  // Numbers
  if (/^-?\d+(\.\d+)?$/.test(val)) {
    return Number(val);
  }

  // Inline array e.g. [a, b, c]
  if (val.startsWith('[') && val.endsWith(']')) {
    const inner = val.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((item) => parseScalar(item.trim()));
  }

  return val;
}
