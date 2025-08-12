export const config = {
  runtime: 'edge',
  maxDuration: 30,
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }});
  }

  if (req.method === 'POST') {
    try {
      const audioBlob = await req.blob();
      const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
      const elevenLabsUrl = 'https://api.elevenlabs.io/v1/speech-to-text/scribe_v1/stream';

      const elevenLabsResponse = await fetch(elevenLabsUrl, {
        method: 'POST',
        headers: { 
          'xi-api-key': elevenLabsApiKey, 
          // --- THIS IS THE CRITICAL FIX ---
          // The Content-Type now correctly matches what the browser sends.
          'Content-Type': 'audio/webm' 
        },
        body: audioBlob,
      });

      if (!elevenLabsResponse.ok) {
        const errorText = await elevenLabsResponse.text();
        // Send a more descriptive error back to the extension
        return new Response(JSON.stringify({ error: `ElevenLabs API Error: ${errorText}` }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
      }
      
      const elevenLabsResult = await elevenLabsResponse.json();
      const rawText = elevenLabsResult.text || '';

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiApiKey}`;
      const prompt = `You are an expert AI editor. Your task is to take the following raw, transcribed text and clean it up. 1. Remove all filler words (like "um", "uh", "like", "you know", "so", "well", etc.). 2. Correct any grammatical mistakes and improve sentence structure. 3. Fix any false starts or repeated phrases. 4. Ensure the final text flows naturally and professionally, but KEEP THE ORIGINAL TONE AND MEANING. 5. Do not add any extra information or introductory phrases like "Here is the cleaned-up text:". Just provide the cleaned text directly. Raw Text: "${rawText}" Cleaned Text:`;
      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      });

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
