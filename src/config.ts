/**
 * Configuration module for Mochi MCP server.
 * Loads settings from environment variables with sensible defaults.
 */

export interface Config {
    /** Mochi API key (required) */
    apiKey: string;
    /** Mochi API base URL */
    apiBaseUrl: string;
    /** Allow deck deletion (dangerous, disabled by default) */
    allowDeckDelete: boolean;
    /** Preview token expiry in minutes */
    tokenExpiryMins: number;
}

/**
 * Load configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadConfig(): Config {
    const apiKey = process.env.MOCHI_API_KEY;

    if (!apiKey) {
        throw new Error(
            'MOCHI_API_KEY environment variable is required. ' +
            'Get your API key from Mochi app settings.'
        );
    }

    return {
        apiKey,
        apiBaseUrl: process.env.MOCHI_API_BASE_URL || 'https://app.mochi.cards/api',
        allowDeckDelete: process.env.MOCHI_ALLOW_DECK_DELETE === 'true',
        tokenExpiryMins: parseInt(process.env.MOCHI_TOKEN_EXPIRY_MINS || '10', 10),
    };
}

/**
 * Validate confirmation string format.
 * Used for delete operations that require typed confirmation.
 */
export function validateDeleteConfirmation(
    confirmation: string,
    expectedId: string,
    type: 'card' | 'deck'
): boolean {
    const expected = `delete ${type} ${expectedId}`;
    return confirmation.toLowerCase().trim() === expected.toLowerCase();
}
