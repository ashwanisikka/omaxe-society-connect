import { GoogleGenAI } from '@google/genai';

class GeminiService {
  private ai: GoogleGenAI | null = null;

  constructor() {
    // Looks for the key dynamically in the Vercel environment
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  // Helper function to safely clean and parse JSON responses from Gemini
  private cleanAndParseJSON(rawResponse: string) {
    try {
      let cleanString = rawResponse.trim();
      // Remove leading markdown block indicators if present (like ```json)
      if (cleanString.startsWith("```")) {
        cleanString = cleanString.replace(/^
