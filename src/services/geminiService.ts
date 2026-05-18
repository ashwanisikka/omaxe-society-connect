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

  // Safely cleans and parses JSON responses from Gemini without risky regular expressions
  private cleanAndParseJSON(rawResponse: string) {
    try {
      let cleanString = rawResponse.trim();
      
      // Clean leading markdown block indicators (```json or ```) using safe string slicing
      if (cleanString.startsWith("```")) {
        cleanString = cleanString.slice(3).trim();
        if (cleanString.toLowerCase().startsWith("json")) {
          cleanString = cleanString.slice(4).trim();
        }
      }
      
      // Clean trailing markdown block indicators (```)
      if (cleanString.endsWith("```")) {
        cleanString = cleanString.slice(0, -3).trim();
      }
      
      return JSON.parse(cleanString.trim());
    } catch (e) {
      console.error("Failed to parse sanitized AI response. Falling back to raw parse.", e);
      return JSON.parse(rawResponse);
    }
  }

  async moderateImage(base64Image: string, mimeType: string): Promise<{ safe: boolean; reason?: string }> {
    if (!this.ai) {
      return { safe: true, reason: "AI not configured, bypassing moderation." };
    }
    try {
      const prompt = `Analyze this image for a residential community portal. Is there any nudity, graphic violence, or highly inappropriate content? Answer in JSON format: { "safe": boolean, "reason": "string if unsafe" }`;
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          prompt,
          {
            inlineData: {
              data: base64Image.split(',')[1] || base64Image,
              mimeType: mimeType
            }
          }
        ]
      });

      const text = response.text || "{ \"safe\": true }";
      
      // Sanitized cleaning integration to stop syntax crash on backticks
      return this.cleanAndParseJSON(text);
    } catch (error) {
      console.error("AI Moderation error:", error);
      return { safe: true };
    }
  }
}

export const geminiService = new GeminiService();
