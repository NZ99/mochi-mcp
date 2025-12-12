/**
 * Utilities for parsing and generating Mochi card markdown.
 */

export interface ParsedCardContent {
    question: string;
    answer: string;
}

/**
 * Parse raw card content into question and answer components.
 * Splits on the standard "---" separator used by Mochi.
 */
export function parseCardContent(content: string): ParsedCardContent {
    // Split content on --- to separate Q and A
    // We use a regex to handle potential surrounding whitespace but respect the separator
    const parts = content.split(/\n---\n/);

    // If no separator found, everything is the question (Mochi default behavior)
    // But we trim to be safe
    const question = parts[0]?.trim() || '';
    const answer = parts[1]?.trim() || '';

    return { question, answer };
}

/**
 * Reconstruct raw card content from question and answer components.
 * Ensures the standard "---" separator is used.
 */
export function buildCardContent(question: string, answer: string): string {
    const cleanQuestion = question.trim();
    const cleanAnswer = answer.trim();

    // If answer is empty, just return question (though Mochi usually wants --- for Q/A cards)
    // We will always enforce the separator if there is an answer, or if we want to preserve structure.
    // For consistency with field edits, we probably always want the separator 
    // unless the user explicitly cleared the answer.

    return `${cleanQuestion}\n\n---\n\n${cleanAnswer}`;
}
