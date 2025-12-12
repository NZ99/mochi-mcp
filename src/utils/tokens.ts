/**
 * Confirmation token management for two-phase commit operations.
 * Tokens are short-lived and single-use.
 */

export interface PendingOperation {
    type: 'create_card' | 'update_card' | 'batch_update_card' | 'batch_tag_update';
    data: Record<string, unknown>;
    createdAt: Date;
    expiresAt: Date;
}

// In-memory token storage (simple, single-process)
const pendingOperations = new Map<string, PendingOperation>();

/**
 * Generate a new confirmation token for a pending operation.
 */
export function createToken(
    type: PendingOperation['type'],
    data: Record<string, unknown>,
    expiryMins: number
): string {
    // Clean expired tokens periodically
    cleanExpiredTokens();

    const token = generateTokenId();
    const now = new Date();

    pendingOperations.set(token, {
        type,
        data,
        createdAt: now,
        expiresAt: new Date(now.getTime() + expiryMins * 60 * 1000),
    });

    return token;
}

/**
 * Consume a token and return the pending operation.
 * Token is invalidated after use.
 */
export function consumeToken(token: string): PendingOperation | null {
    const operation = pendingOperations.get(token);

    if (!operation) {
        return null;
    }

    // Remove token (single-use)
    pendingOperations.delete(token);

    // Check expiry
    if (new Date() > operation.expiresAt) {
        return null;
    }

    return operation;
}

/**
 * Get pending operation without consuming it (for inspection).
 */
export function getToken(token: string): PendingOperation | null {
    const operation = pendingOperations.get(token);

    if (!operation || new Date() > operation.expiresAt) {
        return null;
    }

    return operation;
}

/**
 * Remove expired tokens.
 */
function cleanExpiredTokens(): void {
    const now = new Date();
    for (const [token, op] of pendingOperations) {
        if (now > op.expiresAt) {
            pendingOperations.delete(token);
        }
    }
}

/**
 * Generate a random token ID.
 */
function generateTokenId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

/**
 * Clear all pending operations (for testing).
 */
export function clearAllTokens(): void {
    pendingOperations.clear();
}
