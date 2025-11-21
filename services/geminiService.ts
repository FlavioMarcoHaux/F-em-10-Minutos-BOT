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
    const model = 'gemini-3-pro-preview';

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
  const model = "gemini-3-pro-preview";
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
    const model = "gemini-3-pro-preview";
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
    const model = 'gemini-3-pro-preview';
    
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

// Fix: Add the missing `createMediaPromptFromPrayer` function to generate a visual prompt from prayer text.
export const createMediaPromptFromPrayer = async (prayer: string, language: string): Promise<string> => {
    const model = "gemini-3-pro-preview";
    const prompts: { [key: string]: string } = {
        pt: `
            Baseado na seguinte oração, crie um único prompt de imagem, em uma única linha de texto, para uma IA de geração de imagem.
            O prompt deve ser visualmente descritivo, evocativo e capturar a essência emocional e simbólica da oração.
            A resposta DEVE ser apenas o prompt, sem explicações. O prompt final DEVE estar em português.

            Oração: "${prayer}"
        `,
        en: `
            Based on the following prayer, create a single, one-line image prompt for an image generation AI.
            The prompt should be visually descriptive, evocative, and capture the emotional and symbolic essence of the prayer.
            The response MUST be only the prompt, with no explanation. The final prompt MUST be in English.

            Prayer: "${prayer}"
        `,
        es: `
            Basado en la siguiente oración, crea un único prompt de imagen, en una sola línea de texto, para una IA de generación de imágenes.
            El prompt debe ser visualmente descritivo, evocador y capturar la esencia emocional y simbólica de la oración.
            La respuesta DEBE ser solo el prompt, sin explicaciones. El prompt final DEBE estar en español.

            Oración: "${prayer}"
        `
    };

    const instruction = prompts[language] || prompts['en'];

    try {
        const response = await ai.models.generateContent({
          model,
          contents: [{ parts: [{ text: instruction }] }],
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error creating media prompt from prayer:", error);
        throw new Error("Failed to create media prompt from prayer.");
    }
};

export const createThumbnailPromptFromPost = async (title: string, description: string, prayer: string, language: string): Promise<string> => {
    const model = "gemini-3-pro-preview";
    const prompts: { [key: string]: string } = {
        pt: `
            Você é um especialista em comunicação visual e "Clickbait Ético" para YouTube. Sua tarefa é criar um prompt de imagem para o modelo Imagen 4 Ultra que gere uma thumbnail EXTREMAMENTE impactante (proporção 16:9).

            **ESTRATÉGIA VISUAL (ALTO CTR):**
            1.  **TEXTO NA IMAGEM:** A imagem DEVE ter uma composição que sugira ou inclua os seguintes textos (em português):
                -   Topo (Letras Garrafais/Amarelo Ouro): "PARA MUDAR SUA VIDA AGORA!"
                -   Base (Letras Brancas Grandes): "ORAÇÃO MAIS PODEROSA DE [TEMA]" (Extraia o tema do conteúdo).
            2.  **Contraste Extremo:** Fundo escuro (preto, azul meia-noite, roxo profundo) vs. Texto/Luz Amarelo e Branco Brilhante.
            3.  **Emoção:** Use simbolismo de luz divina, mãos em oração, ou silhueta em montanha. A imagem deve "saltar" na tela.

            **Regras de Saída:**
            -   O prompt final DEVE estar em português.
            -   A resposta DEVE ser apenas o prompt de imagem, uma única linha.
            -   Descreva detalhadamente a posição do texto e as cores para a IA de imagem.

            **Conteúdo de Entrada:**
            -   Título: ${title}
            -   Roteiro: ${prayer}

            Gere o prompt da thumbnail agora.
        `,
        en: `
            You are a visual communication and "Ethical Clickbait" expert for YouTube. Your task is to create an image prompt for the Imagen 4 Ultra model to generate an EXTREMELY impactful thumbnail (16:9 ratio).

            **VISUAL STRATEGY (HIGH CTR):**
            1.  **TEXT ON IMAGE:** The image MUST have a composition that suggests or includes the following text (in English):
                -   Top (Bold/Golden Yellow): "TO CHANGE YOUR LIFE NOW!"
                -   Bottom (Large White Letters): "MOST POWERFUL PRAYER FOR [TOPIC]" (Extract the topic).
            2.  **Extreme Contrast:** Dark background (black, midnight blue, deep purple) vs. Bright Yellow and White Text/Light.
            3.  **Emotion:** Use symbolism of divine light, praying hands, or silhouette on a mountain. The image must "pop" off the screen.

            **Output Rules:**
            -   The final prompt MUST be in English.
            -   The response MUST be only the image prompt, a single line.
            -   Describe the text positioning and colors in detail for the image AI.

            **Input Content:**
            -   Title: ${title}
            -   Script: ${prayer}

            Generate the thumbnail prompt now.
        `,
        es: `
            Eres un experto en comunicación visual y "Clickbait Ético" para YouTube. Tu tarea es crear un prompt de imagen para el modelo Imagen 4 Ultra que genere una miniatura EXTREMADAMENTE impactante (proporción 16:9).

            **ESTRATEGIA VISUAL (ALTO CTR):**
            1.  **TEXTO EN LA IMAGEN:** La imagen DEBE tener una composición que sugiera o incluya los siguientes textos (en español):
                -   Arriba (Letras Grandes/Amarillo Dorado): "¡PARA CAMBIAR TU VIDA AHORA!"
                -   Abajo (Letras Blancas Grandes): "ORACIÓN MÁS PODEROSA DE [TEMA]" (Extrae el tema).
            2.  **Contraste Extremo:** Fondo oscuro (negro, azul medianoche, púrpura profundo) vs. Texto/Luz Amarillo y Blanco Brillante.
            3.  **Emoción:** Usa simbolismo de luz divina, manos orando o silueta en montaña. La imagen debe "saltar" en la pantalla.

            **Reglas de Salida:**
            -   El prompt final DEBE estar en español.
            -   La respuesta DEBE ser solo el prompt de imagen, una sola línea.
            -   Describe detalladamente la posición del texto y los colores para la IA de imagen.

            **Contenido de Entrada:**
            -   Título: ${title}
            -   Guion: ${prayer}

            Genera el prompt de la miniatura ahora.
        `
    };

    const instruction = prompts[language] || prompts['en'];

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
    const model = 'gemini-3-pro-preview';
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
    const model = 'gemini-3-pro-preview';

    const prompts: { [key: string]: string } = {
        pt: `
            Você é o especialista em SEO e mídias sociais do canal 'Fé em 10 minutos de Oração' (YouTube: https://www.youtube.com/@fe10minutos).
            Sua tarefa é gerar um Título, uma Descrição, Capítulos e Tags otimizados para um novo vídeo longo de ${durationInMinutes} minutos.
            O TEMA DO VÍDEO é: "${theme}".
            A LISTA DE 3 SUBTEMAS é: 1. ${subthemes[0]}, 2. ${subthemes[1]}, 3. ${subthemes[2]}.

            **REGRAS (TÍTULO - FORMATO VIRAL OBRIGATÓRIO):**
            - Deve seguir ESTRITAMENTE este modelo: "A ORAÇÃO MAIS PODEROSA DE [TEMA] PARA MUDAR SUA VIDA | Fé em 10 minutos de Oração"
            - Substitua [TEMA] pelo tema do vídeo.

            **REGRAS (DESCRIÇÃO - FORMATO DE CONEXÃO):**
            - Repita o Título exato na primeira linha.
            - Pule uma linha.
            - O parágrafo seguinte DEVE seguir este template exato (substitua o que está entre colchetes):
              "Nesta oração guiada de hoje, entregue-se a um momento de profunda intimidade com Deus através de uma mensagem de fé tocante sobre [TEMA]. Façamos juntos esta oração poderosa para reconhecer as bênçãos divinas, renovar as esperanças e trazer paz ao coração."
            - Inclua os links de CTA:
              🕊️ ASSISTA TAMBÉM:
              ► Oração da Manhã (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbKppEyZUaBoXw4BVxZTq-I2
              ► Oração da Noite (Playlist): https://www.youtube.com/playlist?list=PLmeEfeSNeLbLFUayT8Sfb9IQzr0ddkrHC
              🔗 INSCREVA-SE NO CANAL: https://www.youtube.com/@fe10minutos

            **REGRAS (CAPÍTULOS):**
            - Crie 5-6 capítulos.
            - O primeiro capítulo deve ser "Introdução (Mensagem de Fé)".
            - Use os 3 SUBTEMAS para criar os capítulos do meio.
            - O último capítulo deve ser "Palavra Final e Bênção".
            - O resultado deve ser uma string multilinhas, apenas com os títulos dos capítulos, um por linha. NÃO inclua marcações de tempo (ex: "00:00 -").

            **REGRAS (TAGS/HASHTAGS):**
            - Na Descrição (3 hashtags): Crie 3 hashtags, incluindo #Oração, #Fé, e uma para o TEMA sem espaços (ex: #BencaoFinanceira).
            - No campo "Tags": inclua "Fé em 10 minutos de Oração", "Oração de 10 minutos", "Oração Poderosa", o TEMA, "Oração Diária", "Oração Guiada", "Intimidade com Deus", "Oração da Noite", "Oração para Dormir", "Palavra de Deus", "Mensagem de Fé", "Devocional Diário".

            **FORMATO DA RESPOSTA:**
            Sua resposta DEVE ser um único objeto JSON válido, sem nenhum texto ou formatação markdown antes ou depois.
            O objeto JSON deve ter cinco chaves: "title" (string), "description" (string), "hashtags" (array de 3 strings, sem '#'), "timestamps" (string multilinhas), e "tags" (array de strings).
        `,
        en: `
            You are the SEO and social media expert for the 'Faith in 10 Minutes' channel (YouTube: https://www.youtube.com/@Faithin10Minutes).
            Your task is to generate an optimized Title, Description, Timestamps, and Tags for a new ${durationInMinutes}-minute long-form video.
            The VIDEO TOPIC is: "${theme}".
            The LIST OF 3 SUBTOPICS is: 1. ${subthemes[0]}, 2. ${subthemes[1]}, 3. ${subthemes[2]}.

            **RULES (TITLE - MANDATORY VIRAL FORMAT):**
            - Must strictly follow this model: "THE MOST POWERFUL PRAYER FOR [TOPIC] TO CHANGE YOUR LIFE | Faith in 10 Minutes"
            - Replace [TOPIC] with the video topic.

            **RULES (DESCRIPTION - CONNECTION FORMAT):**
            - Start by repeating the exact Title.
            - Skip a line.
            - The next paragraph MUST follow this exact template (replace brackets):
              "In today's guided prayer, surrender to a moment of deep intimacy with God through a touching message of faith about [TOPIC]. Let us pray this powerful prayer together to recognize divine blessings, renew hope, and bring peace to your heart."
            - Include CTA links:
              🕊️ WATCH NEXT:
              ► Architecture of the Soul (Playlist) https://www.youtube.com/playlist?list=PLTQIQ5QpCYPo11ap1JUSiItZtoiV_4lEH
              ► Morning Prayers (Playlist): https://www.youtube.com/playlist?list=PLTQIQ5QpCYPqym_6TF19PB71SpLpAGuZr
              ► Evening Prayers (Playlist): https://www.youtube.com/playlist?list=PLTQIQ5QpCYPq91fvXaDSideb8wrnG-YtR
              🔗 SUBSCRIBE TO THE CHANNEL: https://www.youtube.com/@Faithin10Minutes

            **RULES (TIMESTAMPS):**
            - Create 5-6 chapters.
            - The first chapter must be "Introduction (Message of Faith)".
            - Use the 3 SUBTOPICS to create the middle chapters.
            - The last chapter must be "Final Word and Blessing".
            - The result should be a multiline string, with only the chapter titles, one per line. DO NOT include timestamps (e.g., "00:00 -").

            **RULES (TAGS/HASHTAGS):**
            - In Description (3 hashtags): Create 3 hashtags, including #Prayer, #Faith, and one for the TOPIC with no spaces (e.g., #FinancialBlessing).
            - In "Tags" field: include "Faith in 10 Minutes", "10 Minute Prayer", "Powerful Prayer", the TOPIC, "Daily Prayer", "Guided Prayer", "Relationship with God", "Morning Prayer", "Evening Prayer", "Prayer for Sleep", "Prayer for Anxiety", "Prayer for Healing", "Word of God", "Message of Faith", "Daily Devotional".

            **RESPONSE FORMAT:**
            Your response MUST be a single, valid JSON object, with no text or markdown formatting before or after it.
            The JSON object must have five keys: "title" (string), "description" (string), "hashtags" (array of 3 strings, without '#'), "timestamps" (multiline string), and "tags" (array of strings).
        `,
         es: `
            Eres el experto en SEO y redes sociales para un canal de YouTube enfocado en la fe (similar a 'Faith in 10 Minutes').
            Tu tarea es generar un Título, Descripción, Capítulos y Etiquetas optimizados para un nuevo video largo de ${durationInMinutes} minutos.
            El TEMA DEL VIDEO es: "${theme}".
            La LISTA DE 3 SUBTEMAS es: 1. ${subthemes[0]}, 2. ${subthemes[1]}, 3. ${subthemes[2]}.

            **REGLAS (TÍTULO - FORMATO VIRAL OBLIGATORIO):**
            - Debe seguir ESTRICTAMENTE este modelo: "LA ORACIÓN MÁS PODEROSA DE [TEMA] PARA CAMBIAR TU VIDA | Fe en 10 Minutos"
            - Reemplaza [TEMA] con el tema del video.

            **REGLAS (DESCRIPCIÓN - FORMATO DE CONEXIÓN):**
            - Comienza repitiendo el Título exacto.
            - Salta una línea.
            - El siguiente párrafo DEBE seguir esta plantilla exacta (reemplaza los corchetes):
              "En esta oración guiada de hoy, entrégate a un momento de profunda intimidad con Dios a través de un conmovedor mensaje de fe sobre [TEMA]. Hagamos juntos esta poderosa oración para reconocer las bendiciones divinas, renovar la esperanza y traer paz al corazón."
            - Incluye enlaces CTA (puedes usar los de la versión en inglés como plantilla):
              🕊️ MIRA A CONTINUACIÓN:
              ► Oraciones Matutinas (Playlist): https://www.youtube.com/playlist?list=PLTQIQ5QpCYPqym_6TF19PB71SpLpAGuZr
              ► Oraciones Nocturnas (Playlist): https://www.youtube.com/playlist?list=PLTQIQ5QpCYPq91fvXaDSideb8wrnG-YtR
              🔗 SUSCRÍBETE AL CANAL: https://www.youtube.com/@Faithin10Minutes

            **REGLAS (CAPÍTULOS):**
            - Crea 5-6 capítulos.
            - El primer capítulo debe ser "Introducción (Mensaje de Fe)".
            - Usa los 3 SUBTEMAS para crear los capítulos intermedios.
            - El último capítulo debe ser "Palabra Final y Bendición".
            - El resultado debe ser una cadena de texto multilínea, solo con los títulos de los capítulos, uno por línea. NO incluyas marcas de tiempo (ej: "00:00 -").

            **REGLAS (ETIQUETAS/HASHTAGS):**
            - En la Descripción (3 hashtags): Crea 3 hashtags, incluyendo #Oracion, #Fe, y uno para el TEMA sin espacios (ej: #BendicionFinanciera).
            - En el campo "Etiquetas": incluye "Fe en 10 Minutos", "Oración de 10 minutos", "Oración Poderosa", el TEMA, "Oración Diária", "Oración Guiada", "Relación con Dios", "Oración de la Mañana", "Oración de la Noche", "Oración para Dormir", "Palabra de Dios", "Mensaje de Fe", "Devocional Diario".

            **FORMATO DE RESPUESTA:**
            Tu respuesta DEBE ser un único objeto JSON válido, sin texto ni formato markdown antes o después.
            El objeto JSON debe tener cinco claves: "title" (string), "description" (string), "hashtags" (array de 3 strings, sin '#'), "timestamps" (string multilínea), y "tags" (array de strings).
        `
    };
    
    const prompt = prompts[language] || prompts['en'];

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