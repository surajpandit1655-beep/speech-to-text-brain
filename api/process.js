// This tells Vercel how to handle incoming requests
export const config = {
  runtime: 'edge',
  maxDuration: 30, // Allows the function to run for up to 30 seconds
};

// This is the main function that runs when your extension calls this URL
export default async function handler(req) {
  // We only allow POST requests, which is how files/data are sent
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // --- Step 1: Get audio from the request and send to ElevenLabs ---

    const audioBlob = await req.blob(); // Get the audio file sent from the Chrome extension
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsUrl = 'https://api.elevenlabs.io/v1/speech-to-text/v1/stream';

    const elevenLabsResponse = await fetch(elevenLabsUrl, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'audio/mpeg',
      },
      body: audioBlob,
    });

    if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text();
        console.error("ElevenLabs Error:", errorText);
        return new Response(`ElevenLabs API Error: ${errorText}`, { status: 500 });
    }
    
    // The result from ElevenLabs streaming is a bit complex, we parse it.
    const elevenLabsResult = await elevenLabsResponse.json();
    const rawText = elevenLabsResult.text || '';


    // --- Step 2: Send the raw text to Google Gemini for cleaning ---

    const geminiApiKey = process.env.GEMINI_API_KEY;
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;

    // This is the instruction we give to the Gemini AI
    const prompt = `
      You are an expert AI editor. Your task is to take the following raw, transcribed text and clean it up.
      1. Remove all filler words (like "um", "uh", "like", "you know", "so", "well", etc.).
      2. Correct any grammatical mistakes and improve sentence structure.
      3. Fix any false starts or repeated phrases.
      4. Ensure the final text flows naturally and professionally, but KEEP THE ORIGINAL TONE AND MEANING.
      5. Do not add any extra information or introductory phrases like "Here is the cleaned-up text:". Just provide the cleaned text directly.

      Raw Text: "${rawText}"
      
      Cleaned Text:
    `;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        console.error("Gemini Error:", errorText);
        return new Response(`Gemini API Error: ${errorText}`, { status: 500 });
    }

    const geminiResult = await geminiResponse.json();
    // The actual text is nested deep inside the response
    const cleanedText = geminiResult.candidates[0].content.parts[0].text;

    // --- Step 3: Send the final, clean text back to the Chrome Extension ---
    return new Response(JSON.stringify({ cleanedText: cleanedText.trim() }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}