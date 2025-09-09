/**
 * Detects the indentation pattern used in existing field declarations within the class.
 * Analyzes 2-3 field declarations to determine if spaces or tabs are used and how many.
 */
export function detectIndentation(lines: string[], classStartLine: number, classEndLine: number): string {
  const fieldIndentations: string[] = [];

  // Look for existing field declarations (lines with @Field or property declarations)
  for (let i = classStartLine + 1; i < classEndLine; i++) {
    const line = lines[i];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("//") || line.trim().startsWith("*")) {
      continue;
    }

    // Look for decorator lines (@Field, @Text, etc.) or property declarations
    if (line.includes("@") || (line.includes(":") && line.includes(";"))) {
      // Extract the leading whitespace
      const match = line.match(/^(\s*)/);
      if (match && match[1]) {
        fieldIndentations.push(match[1]);

        // Stop after collecting 3 samples for consistency
        if (fieldIndentations.length >= 3) {
          break;
        }
      }
    }
  }

  // If no existing fields found, detect class-level indentation and add one level
  if (fieldIndentations.length === 0) {
    const classLine = lines[classStartLine];
    const classIndentMatch = classLine.match(/^(\s*)/);
    const classIndent = classIndentMatch ? classIndentMatch[1] : "";

    // Determine if the project uses tabs or spaces
    if (classIndent.includes("\t")) {
      return classIndent + "\t";
    } else {
      // Default to 4 spaces if no pattern detected
      const spaceCount = classIndent.length + 4;
      return " ".repeat(spaceCount);
    }
  }

  // Analyze the collected indentations to find the most common pattern
  const indentationCounts = new Map<string, number>();
  fieldIndentations.forEach((indent) => {
    const count = indentationCounts.get(indent) || 0;
    indentationCounts.set(indent, count + 1);
  });

  // Return the most frequently used indentation
  let mostCommonIndent = "";
  let maxCount = 0;
  for (const [indent, count] of indentationCounts) {
    if (count > maxCount) {
      maxCount = count;
      mostCommonIndent = indent;
    }
  }

  return mostCommonIndent || "    "; // Default to 4 spaces if nothing detected
}

/**
 * Applies the detected indentation to the field code.
 */
export function applyIndentation(fieldCode: string, indentation: string): string {
  const lines = fieldCode.split("\n");
  const indentedLines = lines.map((line) => {
    // Skip empty lines
    if (!line.trim()) {
      return line;
    }

    // Apply the base indentation while preserving any existing nested indentation
    return indentation + line;
  });

  return indentedLines.join("\n");
}
