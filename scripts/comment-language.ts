import ts from 'typescript'

export type CommentFinding = { line: number; text: string }

const ACCENTED = /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/
const PORTUGUESE_WORD = /(?<![\p{L}\p{N}_./-])(não|quando|para|sem|com|uma|que|ainda|só)(?![\p{L}\p{N}_])/iu

export const isPortuguese = (comment: string): boolean => ACCENTED.test(comment) || PORTUGUESE_WORD.test(comment)

const scriptKindOf = (fileName: string) => (fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)

// Comment ranges are read at token boundaries; the scanner would also read
// `//` inside JSX text as a comment, so ranges starting there are dropped.
const collectComments = (sourceFile: ts.SourceFile): ts.CommentRange[] => {
  const text = sourceFile.getFullText()
  const ranges = new Map<number, ts.CommentRange>()
  const jsxTextSpans: [number, number][] = []
  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) jsxTextSpans.push([node.pos, node.end])
    const around = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ]
    for (const range of around) ranges.set(range.pos, range)
    for (const child of node.getChildren(sourceFile)) visit(child)
  }
  visit(sourceFile)
  const isInJsxText = (range: ts.CommentRange) =>
    jsxTextSpans.some(([start, end]) => range.pos >= start && range.pos < end)
  return [...ranges.values()].filter(range => !isInJsxText(range)).sort((left, right) => left.pos - right.pos)
}

export const findPortugueseComments = (source: string, fileName: string): CommentFinding[] => {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindOf(fileName))
  return collectComments(sourceFile)
    .map(range => ({
      line: sourceFile.getLineAndCharacterOfPosition(range.pos).line + 1,
      text: source.slice(range.pos, range.end),
    }))
    .filter(finding => isPortuguese(finding.text))
}
