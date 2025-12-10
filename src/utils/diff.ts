/**
 * Simple text diff utility for preview/comparison.
 * Produces a human-readable diff between two strings.
 */

export interface DiffResult {
    original: string;
    proposed: string;
    diff: string;
    hasChanges: boolean;
}

/**
 * Generate a simple line-by-line diff between two strings.
 * Uses - for removed lines and + for added lines.
 */
export function generateDiff(original: string, proposed: string): DiffResult {
    const originalLines = original.split('\n');
    const proposedLines = proposed.split('\n');

    const diffLines: string[] = [];
    const maxLen = Math.max(originalLines.length, proposedLines.length);

    let hasChanges = false;

    for (let i = 0; i < maxLen; i++) {
        const origLine = originalLines[i];
        const propLine = proposedLines[i];

        if (origLine === propLine) {
            if (origLine !== undefined) {
                diffLines.push(`  ${origLine}`);
            }
        } else {
            hasChanges = true;
            if (origLine !== undefined) {
                diffLines.push(`- ${origLine}`);
            }
            if (propLine !== undefined) {
                diffLines.push(`+ ${propLine}`);
            }
        }
    }

    return {
        original,
        proposed,
        diff: diffLines.join('\n'),
        hasChanges,
    };
}

/**
 * Format a card for display, showing key info.
 */
export function formatCardPreview(card: {
    id: string;
    content: string;
    tags?: string[];
    'deck-id'?: string;
}): string {
    const lines = [
        `**Card ID:** ${card.id}`,
        card['deck-id'] ? `**Deck:** ${card['deck-id']}` : null,
        card.tags && card.tags.length > 0 ? `**Tags:** ${card.tags.join(', ')}` : null,
        '',
        '**Content:**',
        '```',
        card.content,
        '```',
    ].filter(Boolean);

    return lines.join('\n');
}
