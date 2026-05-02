/**
 * API Client for server communication
 * This will be used when you implement the backend server
 */

import type { PlayerNote } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // Load notes for a specific player
  async getPlayerNotes(nickname: string, userId: string): Promise<PlayerNote[]> {
    const response = await fetch(`${this.baseUrl}/players/${nickname}/notes?userId=${userId}`);

    if (!response.ok) {
      throw new Error(`Failed to load notes: ${response.status}`);
    }

    return response.json();
  }

  // Save new note
  async saveNote(note: Omit<PlayerNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<PlayerNote> {
    const response = await fetch(`${this.baseUrl}/players/${note.nickname}/notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(note)
    });

    if (!response.ok) {
      throw new Error(`Failed to save note: ${response.status}`);
    }

    return response.json();
  }

  // Update existing note
  async updateNote(nickname: string, noteId: string, updates: Partial<PlayerNote>): Promise<PlayerNote> {
    const response = await fetch(`${this.baseUrl}/players/${nickname}/notes/${noteId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });

    if (!response.ok) {
      throw new Error(`Failed to update note: ${response.status}`);
    }

    return response.json();
  }

  // Delete note
  async deleteNote(nickname: string, noteId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/players/${nickname}/notes/${noteId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error(`Failed to delete note: ${response.status}`);
    }
  }
}

export const apiClient = new ApiClient();
