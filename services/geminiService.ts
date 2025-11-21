import { GoogleGenAI, Modality, GenerateVideosOperation, Type } from "@google/genai";
import { AspectRatio, SocialMediaPost, YouTubeLongPost } from '../types';
import { decode } from "../utils/audio";

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const themes: { [key: string]: string[] } = {
  en: ['hope', 'gratitude', 'strength', 'peace', 'clarity', 'healing', 'forgiveness'],
  pt: ['esperança', 'gratidão', 'força', 'paz', 'clareza', 'cura', 'perdão'],
  es: ['esperanza', 'gratitud', 'fuerza', 'paz', 'claridad', 'sanación', 'perdón'],
};

export interface MultiSpeakerConfig {
    speakers: {
        name: string;
        voice: string;
    }[];
}

const getRandomTheme = (language: string): string => {
  const langThemes = themes[language] || themes['en'];
  return langThemes[Math.floor(Math.random() * langThemes.length)];
};


const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const getTrendingTopic = async (language: string, contentType: 'long' | 'short'): Promise<{ theme: string; subthemes: string[] }> => {
    const model = 'gemini-2.5-pro';

    const prompts: { [key: string]: string } = {
        pt: `
            Pesquise no Google por um tópico ou sentimento de alta relevância e engajamento para o público cristão no Brasil *hoje*. Foque em temas de esperança, superação, fé ou passagens bíblicas que estão sendo muito comentadas.
            ${contentType === 'long'
                ? 'Identifique um tema principal e três subtemas relacionados que podem ser explorados como capítulos em um vídeo de 10 minutos.'
                : 'Responda com um único tema conciso, ideal para um vídeo de 30 segundos no TikTok.'
            }
            Sua resposta DEVE ser um único objeto JSON. Não inclua nenhum texto, explicação ou formatação markdown antes ou depois do JSON.
            O JSON deve ter a chave "theme" (string) e, para vídeos longos, uma chave "subthemes" (um array de exatamente 3 strings). Para vídeos curtos, o campo "subthemes" deve ser um array vazio.
        `,
        en: `
            Search Google for a high-relevance and engaging topic or sentiment for the Christian audience in the United States *today*. Focus on themes of hope, overcoming challenges, faith, or biblical passages that are being widely discussed.
            ${contentType === 'long'
                ? 'Identify a main theme and three related sub-themes that can be explored as chapters in a 10-minute video.'
                : 'Respond with a single, concise theme, ideal for a 30-second TikTok video.'
            }
            Your response MUST be a single JSON object. Do not include any text, explanation, or markdown formatting before or after the JSON.
            The JSON must have the key "theme" (string) and, for long videos, a key "subthemes" (an array of exactly 3 strings). For short videos, the "subthemes" field must be an empty array.
        `,
        es: `
            Busca en Google un tema o sentimiento de alta relevancia y engagement para el público cristiano en España y Latinoamérica *hoy*. Céntrate en temas de esperanza, superación, fe o pasajes bíblicos que estén siendo muy comentados.
            ${contentType === 'long'
                ? 'Identifica un tema principal y tres subtemas relacionados que puedan ser explorados como capítulos en un video de 10 minutos.'
                : 'Responde con un único tema conciso, ideal para un video de 30 segundos en TikTok.'
            }
            Tu respuesta DEBE ser un único objeto JSON. No incluyas ningún texto, explicación o formato markdown antes o después del JSON.
            El JSON debe tener la clave "theme" (string) y, para videos largos, una clave "subthemes" (un array de exactamente 3 strings). Para videos cortos, el campo "subthemes" deve ser um array vazio.
        `
    };
    
    const finalPrompt = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: finalPrompt }] }],
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        let jsonStr = response.text.trim();
        // Handle potential markdown code block formatting in the response
        if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.substring(7, jsonStr.length - 3).trim();
        } else if (jsonStr.startsWith('```')) {
             jsonStr = jsonStr.substring(3, jsonStr.length - 3).trim();
        }
        
        const parsed = JSON.parse(jsonStr);
        
        // Ensure subthemes is always an array of strings
        if (!parsed.subthemes || !Array.isArray(parsed.subthemes)) {
            parsed.subthemes = [];
        }

        return parsed;

    } catch (error) {
        console.error("Error getting trending topic:", error);
        throw new Error("Failed to get trending topic from Google Search.");
    }
};

export const generateGuidedPrayer = async (prompt: string, language: string, durationInMinutes: number = 10): Promise<string> => {
  const model = "gemini-2.5-pro";
  const finalPrompt = prompt || getRandomTheme(language);

  let minTokens, maxTokens;
  switch (durationInMinutes) {
      case 5: minTokens = 4000; maxTokens = 4200; break;
      case 15: minTokens = 12000; maxTokens = 12200; break;
      case 20: minTokens = 16000; maxTokens = 16200; break;
      default: // 10 minutes
          minTokens = 8000; maxTokens = 8200; break;
  }
  
  const prayerBasePrompt = `
    You are two Master Guides of faith in Prayer: "Roberta Erickson" and "Milton Dilts". Both of you are trained, qualified, and certified in the most advanced Neuro-Linguistic Programming (NLP) and are masters of Ericksonian Hypnosis through Metaphors.
    You specialize in modeling the wisdom of Jesus Christ, Solomon, and David.
    Your response must be a DIALOGUE between the two speakers and written in this language: ${language}.
    Each line MUST be prefixed with the speaker's name, like "Roberta Erickson:" or "Milton Dilts:". This is crucial for the audio generation.

    **TONE AND STYLE**: Adopt the persona of a wise Ericksonian therapist. The tone must be therapeutic, deeply empathetic, and spiritually profound. Use a rich tapestry of allegories, metaphors, and symbols to guide the listener. The language must be accessible and engaging for a broad, mainstream audience. Avoid overly technical, academic, or niche theological terms. The goal is mass communication and connection.

    **CORE TECHNIQUES TO INTEGRATE**:
    1.  **Metaphorical Hypnotherapy**: Weave biblical stories and wisdom into powerful metaphors that resonate with everyday life situations (work, family, personal struggles).
    2.  **NLP Anchoring**: Intentionally create powerful psychological anchors and triggers. For example, connect a feeling of peace to the action of breathing deeply, or a sense of strength to a specific phrase.
    3.  **Mirroring Wisdom**: Don't just quote Solomon, David, and Jesus. *Mirror* their way of thinking. Connect their ancient wisdom to the listener's modern-day challenges, making it practical and actionable.
    4.  **Sensory Language**: Use vivid sensory language (see, hear, feel) to deepen the state of connection and immersion. Guide the listener through internal visualizations.
    5.  **Incredible CTAs**: Seamlessly integrate compelling calls-to-action for our channels, "Fé em 10 Minutos" and "Faith in 10 Minutes". Frame them as an invitation to continue this journey of growth. For example: "If this message resonated with your spirit, subscribe to 'Fé em 10 Minutos' to receive your daily dose of strength."

    **ABSOLUTE CRITICAL INSTRUCTION ON LENGTH**: This is the most important rule. Your goal is to create a long, rich, and profound dialogue suitable for a ${durationInMinutes}-minute guided prayer. The final response MUST have a total token count between ${minTokens} and ${maxTokens} tokens. Maximize the depth and length of the content within this specific range. It is absolutely crucial that the script has a complete and natural ending. The dialogue must conclude properly and not be cut off abruptly. Create a full, immersive experience with a clear beginning, a deep exploration of the theme, and a satisfying, conclusive end.

    The central theme for this prayer is: "${finalPrompt}".

    Begin the dialogue now.
  `;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prayerBasePrompt }] }],
      config: {
          temperature: 0.9,
          maxOutputTokens: maxTokens,
      }
    });
    return response.text;
  } catch (error) {
    console.error("Error generating guided prayer:", error);
    throw error;
  }
};

export const generateShortPrayer = async (prompt: string, language: string): Promise<string> => {
    const model = "gemini-2.5-pro";
    const finalPrompt = prompt || getRandomTheme(language);

    const prayerBasePrompt = `
      You are a Master of Guided Prayer, modeling your wisdom on Jesus Christ, King Solomon, and King David.
      Your response must be in the language: ${language}.
      
      Create a short, powerful prayer (a "prayer pill") of about 3-5 sentences.
      The theme is: "${finalPrompt}".
      The prayer should be concise, heartfelt, and offer a moment of connection or encouragement.
      You may include a very short, relevant biblical quote if it fits naturally.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prayerBasePrompt }] }],
        });
        return response.text;
    } catch (error) {
        console.error("Error generating short prayer:", error);
        throw error;
    }
};

export const analyzeImage = async (imageFile: File, prompt: string, language: string): Promise<string> => {
    const model = 'gemini-2.5-pro';
    
    let analysisPrompt = prompt.trim();
    if (!analysisPrompt) {
        analysisPrompt = language === 'pt' 
            ? "Analise esta imagem de uma perspectiva espiritual e simbólica. Que significados mais profundos, emoções ou arquétipos ela pode representar?"
            : "Analyze this image from a spiritual and symbolic perspective. What deeper meanings, emotions, or archetypes might it represent?";
    }
    
    analysisPrompt = `${analysisPrompt} Respond in the language: ${language}.`;

    try {
        const imagePart = await fileToGenerativePart(imageFile);
        const textPart = { text: analysisPrompt };

        const response = await ai.models.generateContent({
          model,
          contents: [{ parts: [imagePart, textPart] }]
        });

        return response.text;
    } catch (error) {
        console.error("Error analyzing image:", error);
        throw error;
    }
};

export const createMediaPromptFromPrayer = async (prayerText: string): Promise<string> => {
  const model = "gemini-2.5-pro";
  const mediaPromptInstruction = `
    Based on the following prayer, create a concise, visually descriptive prompt for an AI image generator. The prompt should capture the core emotion and symbolism of the prayer in a single sentence. Focus on creating a powerful, artistic, and metaphorical image. Do not include any text in the prompt.

    Prayer:
    """
    ${prayerText}
    """

    Prompt:
  `;
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: mediaPromptInstruction }] }],
    });
    return response.text.trim().replace(/"/g, ''); // Clean up the output
  } catch (error) {
    console.error("Error creating media prompt:", error);
    throw new Error("Failed to create a visual prompt for the media.");
  }
};

export const createThumbnailPromptFromPost = async (title: string, description: string, prayer: string, language: string): Promise<string> => {
    const model = "gemini-2.5-pro";
    const instruction = `
      You are an expert AI art director. Based on the following social media post content (title, description, and the full prayer script), create a single, powerful, and concise prompt for an AI image generator to create a compelling thumbnail.
      The prompt should be visually descriptive, capture the core emotion, and be highly symbolic.
      It MUST include the post's title as text to be rendered prominently in the image.
      The entire prompt must be in this language: ${language}.

      **Title:** ${title}
      **Description:** ${description}
      **Full Script:** ${prayer}

      Analyze the content and generate one single-sentence prompt. Example format: 'An epic cinematic photo of [main subject], with the title "${title}" in bold, dramatic font, [style details like 'glowing light', 'ethereal atmosphere'].'
    `;
    try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: instruction }] }],
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error creating thumbnail prompt:", error);
        throw new Error("Failed to create thumbnail prompt.");
    }
};


export const generateImageFromPrayer = async (prompt: string, aspectRatio: AspectRatio, model: string = 'imagen-4.0-generate-001'): Promise<string> => {
    try {
        const response = await ai.models.generateImages({
            model,
            prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/png',
                aspectRatio,
            },
        });
        
        if (response.generatedImages && response.generatedImages.length > 0) {
            return response.generatedImages[0].image.imageBytes;
        } else {
            throw new Error("No image was generated.");
        }
    } catch (error) {
        console.error("Error generating image:", error);
        throw error;
    }
};

export const generateVideo = async (prompt: string, aspectRatio: AspectRatio): Promise<string> => {
    let operation: GenerateVideosOperation;
    try {
        const newAi = new GoogleGenAI({ apiKey: process.env.API_KEY });
        operation = await newAi.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
                numberOfVideos: 1,
                resolution: '720p',
                aspectRatio: aspectRatio
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            operation = await newAi.operations.getVideosOperation({ operation: operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed, but no download link was found.");
        }
        return downloadLink;

    } catch (error: any) {
        console.error("Error in generateVideo call:", error);
        if (error.error?.status === 'NOT_FOUND') {
            throw { ...error, message: 'API key is invalid or expired.' };
        }
        throw error;
    }
};

export const generateSocialMediaPost = async (prayer: string, language: string): Promise<SocialMediaPost> => {
    const model = 'gemini-2.5-pro';
    const prompt = `
      Analyze the following prayer written in ${language}.
      Your task is to create a social media post for platforms like Instagram Reels or TikTok.
      The response must be a single, valid JSON object, with no markdown formatting or extra text.
      The JSON object must have three keys:
      1.  "title": A very short, catchy, and intriguing title (max 10 words).
      2.  "description": A slightly longer description (2-3 sentences) that expands on the title and includes a call to action to watch the video.
      3.  "hashtags": An array of 5-7 relevant, high-traffic hashtags in the same language as the prayer. Do not include the '#' symbol.

      Prayer:
      """
      ${prayer}
      """
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
            }
        });
        
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating social media post:", error);
        throw new Error("Failed to generate social media post.");
    }
};

export const generateYouTubeLongPost = async (theme: string, subthemes: string[], language: string, durationInMinutes: number = 10): Promise<YouTubeLongPost> => {
    const model = 'gemini-2.5-pro';
    const prompt = `
      You are an expert in YouTube SEO and content strategy for a Christian audience.
      The main theme of the video is "${theme}". The video is structured with three sub-themes: 1) ${subthemes[0]}, 2) ${subthemes[1]}, 3) ${subthemes[2]}.
      The video will be approximately ${durationInMinutes} minutes long.
      Your task is to generate all the necessary metadata for the YouTube upload.
      The response must be in this language: ${language}.
      The response must be a single, valid JSON object, with no markdown formatting or extra text.
      The JSON object must have five keys:
      1. "title": A compelling, SEO-optimized title for the YouTube video.
      2. "description": A detailed, engaging description. It should start with a hook, explain what the video is about, include the three hashtags (as required by YouTube), and end with a call to action to subscribe to "Fé em 10 Minutos" and "Faith in 10 Minutes".
      3. "hashtags": An array of exactly 3 relevant hashtags for the description field. Do not include the '#' symbol.
      4. "timestamps": A multiline string of video chapters. List "Intro", followed by the three subthemes, and end with "Outro". Each chapter title must be on a new line. DO NOT include any timestamps (e.g., "00:00 -").
      5. "tags": An array of 10-15 relevant keywords and phrases for the YouTube tags field.
    `;
    try {
        const response = await ai.models.generateContent({
            model,
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
            }
        });
        return JSON.parse(response.text);
    } catch (error) {
        console.error("Error generating YouTube long post:", error);
        throw new Error("Failed to generate YouTube long post.");
    }
};

export const generateSpeech = async (
  text: string,
  config?: MultiSpeakerConfig,
  callbacks?: {
    onChunk: (pcmData: Uint8Array) => void;
    onProgress: (progress: number) => void;
    onComplete: () => void;
    onError: (error: string) => void;
  }
): Promise<void> => {
  if (!callbacks) {
    console.error("generateSpeech called without callbacks for streaming.");
    return;
  }
  const { onChunk, onProgress, onComplete, onError } = callbacks;

  try {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    if (lines.length === 0) {
        onComplete();
        return;
    }
    const speakerVoices = new Map<string, string>();

    if (config?.speakers) {
      config.speakers.forEach(s => speakerVoices.set(s.name.replace(':', ''), s.voice));
    }

    for (const [index, line] of lines.entries()) {
      let speechText = line;
      let voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } | undefined;

      if (config?.speakers && speakerVoices.size > 0) {
        const parts = line.split(':');
        const speakerName = parts[0].trim();
        const voice = speakerVoices.get(speakerName);
        if (voice && parts.length > 1) {
          speechText = parts.slice(1).join(':').trim();
          voiceConfig = { prebuiltVoiceConfig: { voiceName: voice } };
        } else {
            // If line doesn't match a speaker, use the first speaker as default for consistency
            const defaultVoice = config.speakers[0].voice;
            voiceConfig = { prebuiltVoiceConfig: { voiceName: defaultVoice } };
        }
      }
      
      if (!speechText) {
          onProgress(Math.round(((index + 1) / lines.length) * 100));
          continue;
      };

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: speechText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: voiceConfig,
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        onChunk(decode(base64Audio));
      } else {
        console.warn(`No audio data received for line: "${speechText}"`);
      }
      onProgress(Math.round(((index + 1) / lines.length) * 100));
    }
    onComplete();
  } catch (error: any) {
    console.error("Error during streaming speech generation:", error);
    onError(error.message || "An unknown error occurred during speech generation.");
  }
};