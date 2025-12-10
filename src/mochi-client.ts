/**
 * HTTP client for Mochi REST API.
 * Handles authentication, pagination, and error normalization.
 */

import { Config } from './config.js';

// ============================================================================
// Types
// ============================================================================

export interface MochiCard {
    id: string;
    content: string;
    'deck-id': string;
    name?: string | null;
    pos: string;
    tags: string[];
    'created-at': { date: string };
    'updated-at'?: { date: string };
    'archived?': boolean;
    'trashed?'?: string | null;
    'new?': boolean;
    references: string[];
    reviews: unknown[];
    fields?: Record<string, { id: string; value: string }>;
}

export interface MochiDeck {
    id: string;
    name: string;
    'parent-id'?: string | null;
    sort: number;
    'archived?': boolean;
    'trashed?'?: string | null;
}

export interface PaginatedResponse<T> {
    docs: T[];
    bookmark?: string;
}

export interface MochiError {
    errors: string[] | Record<string, string>;
}

// ============================================================================
// Client
// ============================================================================

// Delay between paginated requests to avoid rate limiting (ms)
const PAGINATION_DELAY_MS = 1500;

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class MochiClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(config: Config) {
        this.apiKey = config.apiKey;
        this.baseUrl = config.apiBaseUrl;
    }

    // --------------------------------------------------------------------------
    // Decks
    // --------------------------------------------------------------------------

    async listDecks(): Promise<MochiDeck[]> {
        const allDecks: MochiDeck[] = [];
        let bookmark: string | undefined;
        let prevBookmark: string | undefined;
        let isFirstRequest = true;

        do {
            // Delay between paginated requests to avoid rate limiting
            if (!isFirstRequest) await sleep(PAGINATION_DELAY_MS);
            isFirstRequest = false;

            const url = bookmark
                ? `${this.baseUrl}/decks/?bookmark=${encodeURIComponent(bookmark)}`
                : `${this.baseUrl}/decks/`;

            const response = await this.request<PaginatedResponse<MochiDeck>>(url);

            // Stop if no docs returned (end of pagination)
            if (!response.docs || response.docs.length === 0) break;

            allDecks.push(...response.docs);
            prevBookmark = bookmark;
            bookmark = response.bookmark;

            // Stop if bookmark repeats (Mochi API quirk)
            if (bookmark === prevBookmark) break;

        } while (bookmark && allDecks.length < 1000); // Safety limit

        return allDecks;
    }

    async getDeck(deckId: string): Promise<MochiDeck> {
        return this.request<MochiDeck>(`${this.baseUrl}/decks/${deckId}`);
    }

    async createDeck(name: string, parentId?: string): Promise<MochiDeck> {
        const body: Record<string, unknown> = { name };
        if (parentId) body['parent-id'] = parentId;

        return this.request<MochiDeck>(`${this.baseUrl}/decks/`, {
            method: 'POST',
            body,
        });
    }

    async deleteDeck(deckId: string, permanent: boolean = false): Promise<void> {
        if (permanent) {
            await this.request(`${this.baseUrl}/decks/${deckId}`, { method: 'DELETE' });
        } else {
            // Soft delete: set trashed? to current timestamp
            await this.request(`${this.baseUrl}/decks/${deckId}`, {
                method: 'POST',
                body: { 'trashed?': new Date().toISOString() },
            });
        }
    }

    // --------------------------------------------------------------------------
    // Cards
    // --------------------------------------------------------------------------

    async listCards(deckId?: string, limit: number = 100): Promise<MochiCard[]> {
        const allCards: MochiCard[] = [];
        let bookmark: string | undefined;
        let prevBookmark: string | undefined;
        let isFirstRequest = true;

        do {
            // Delay between paginated requests to avoid rate limiting
            if (!isFirstRequest) await sleep(PAGINATION_DELAY_MS);
            isFirstRequest = false;

            let url = `${this.baseUrl}/cards/?limit=${limit}`;
            if (deckId) url += `&deck-id=${encodeURIComponent(deckId)}`;
            if (bookmark) url += `&bookmark=${encodeURIComponent(bookmark)}`;

            const response = await this.request<PaginatedResponse<MochiCard>>(url);

            // Stop if no docs returned (end of pagination)
            if (!response.docs || response.docs.length === 0) break;

            allCards.push(...response.docs);
            prevBookmark = bookmark;
            bookmark = response.bookmark;

            // Stop if bookmark repeats (Mochi API quirk)
            if (bookmark === prevBookmark) break;

        } while (bookmark && allCards.length < 5000); // Safety limit

        return allCards;
    }

    async getCard(cardId: string): Promise<MochiCard> {
        return this.request<MochiCard>(`${this.baseUrl}/cards/${cardId}`);
    }

    async createCard(
        deckId: string,
        content: string,
        tags?: string[]
    ): Promise<MochiCard> {
        const body: Record<string, unknown> = {
            'deck-id': deckId,
            content,
        };
        if (tags && tags.length > 0) {
            body['manual-tags'] = tags;
        }

        return this.request<MochiCard>(`${this.baseUrl}/cards/`, {
            method: 'POST',
            body,
        });
    }

    async updateCard(
        cardId: string,
        updates: { content?: string; tags?: string[]; deckId?: string }
    ): Promise<MochiCard> {
        const body: Record<string, unknown> = {};
        if (updates.content !== undefined) body.content = updates.content;
        if (updates.tags !== undefined) body['manual-tags'] = updates.tags;
        if (updates.deckId !== undefined) body['deck-id'] = updates.deckId;

        return this.request<MochiCard>(`${this.baseUrl}/cards/${cardId}`, {
            method: 'POST',
            body,
        });
    }

    async deleteCard(cardId: string, permanent: boolean = false): Promise<void> {
        if (permanent) {
            await this.request(`${this.baseUrl}/cards/${cardId}`, { method: 'DELETE' });
        } else {
            // Soft delete: set trashed? to current timestamp
            await this.request(`${this.baseUrl}/cards/${cardId}`, {
                method: 'POST',
                body: { 'trashed?': new Date().toISOString() },
            });
        }
    }

    // --------------------------------------------------------------------------
    // HTTP
    // --------------------------------------------------------------------------

    private async request<T>(
        url: string,
        options: { method?: string; body?: Record<string, unknown> } = {}
    ): Promise<T> {
        const { method = 'GET', body } = options;

        // HTTP Basic Auth: API key as username, empty password
        const auth = Buffer.from(`${this.apiKey}:`).toString('base64');

        const headers: Record<string, string> = {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json',
        };

        const fetchOptions: RequestInit = { method, headers };

        if (body) {
            headers['Content-Type'] = 'application/json';
            fetchOptions.body = JSON.stringify(body);
        }

        let response = await fetch(url, fetchOptions);

        // Handle rate limiting with retry
        if (!response.ok) {
            const text = await response.text();
            if (text.includes('Please wait')) {
                // Rate limited - wait and retry once
                await sleep(2000);
                response = await fetch(url, fetchOptions);
            }
        }

        if (!response.ok) {
            let errorMessage = `Mochi API error: ${response.status} ${response.statusText}`;
            try {
                const errorBody = await response.json() as MochiError;
                if (Array.isArray(errorBody.errors)) {
                    errorMessage = errorBody.errors.join(', ');
                } else if (typeof errorBody.errors === 'object') {
                    errorMessage = Object.entries(errorBody.errors)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(', ');
                }
            } catch {
                // Ignore JSON parse errors
            }
            throw new Error(errorMessage);
        }

        // Handle empty responses (e.g., DELETE)
        const text = await response.text();
        if (!text) return {} as T;

        return JSON.parse(text) as T;
    }
}
