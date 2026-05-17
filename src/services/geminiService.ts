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
      return JSON.parse(text);
    } catch (error) {
      console.error("AI Moderation error:", error);
      return { safe: true };
    }
  }
}

export const geminiService = new GeminiService();
