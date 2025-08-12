export const config = {
  runtime: 'edge',
  maxDuration: 45, // Increased duration slightly
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, xi-api-key' }});
  }

  if (req.method === 'POST') {
    try {
      const audioBlob = await req.blob();
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      
      // --- FIX #1: Using the CORRECT base URL from your working example ---
      const elevenLabsUrl = 'https://api.elevenlabs.io/v1/speech-to-text';

      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      
      // --- FIX #2: Sending the model_id INSIDE the form data, just like your working example ---
      // We will use 'scribe_v1' as your example did. If this fails, your plan doesn't support it.
      // If it fails again with "Not Found", REMOVE this line to use the default model.
      formData.append('model_id', 'scribe_v1');

      const elevenLabsResponse = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsApiKey,
        },
        body: formData,
      });

      if (!elevenLabsResponse.ok) {
        const errorData = await elevenLabsResponse.json();
        const errorMessage = errorData.detail.message || JSON.stringify(errorData.detail);
        return new Response(JSON.stringify({ error: `ElevenLabs API Error: ${errorMessage}` }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      
      const elevenLabsResult = await elevenLabsResponse.json();
      const rawText = elevenLabsResult.text || '';

      // The Gemini part remains the same...
      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
      const prompt = `You are an expert AI editor. Your task is to take the following raw, transcribed text and clean it up. 1. Remove all filler words (like "um", "uh", "like", "you know", "so", "well", etc.). 2. Correct any grammatical mistakes and improve sentence structure. 3. Fix any false starts or repeated phrases. 4. Ensure the final text flows naturally and professionally, but KEEP THE ORIGINAL TONE AND MEANING. 5. Do not add any extra information or introductory phrases like "Here is the cleaned-up text:". Just provide the cleaned text directly. Raw Text: "${rawText}" Cleaned Text:`;
      const geminiResponse = await fetch(geminiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text();
        return new Response(JSON.stringify({ error: `Gemini API Error: ${errorText}` }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }

      const geminiResult = await geminiResponse.json();
      const cleanedText = geminiResult.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ cleanedText: cleanedText.trim() }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
  }
  return new Response('Method Not Allowed', { status: 405 });
}
