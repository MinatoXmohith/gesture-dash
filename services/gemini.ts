import { GoogleGenAI } from "@google/genai";

// We strictly follow the "do not ask user for key" rule from the prompt persona instructions,
// assuming process.env.API_KEY is available.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateGameOverMessage = async (score: number): Promise<string> => {
  try {
    if (!process.env.API_KEY) {
      return `Game Over! You scored ${score}. (Add API Key for AI roasts)`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `The player just finished a game of "Gesture Dash" with a score of ${score}. 
      Give a short, witty, 1-sentence commentary on their performance. 
      If the score is low (<500), roast them gently. 
      If high (>1000), praise them like a god.`,
    });

    return response.text || `Game Over! Score: ${score}`;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `Game Over! Score: ${score}`;
  }
};
