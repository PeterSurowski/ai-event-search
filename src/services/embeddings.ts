import OpenAI from 'openai';

// Lazy initialization to avoid errors when API key is not set
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

/**
 * Generate an embedding vector for the given text
 * Uses OpenAI's text-embedding-3-small model (1536 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // In development without API key, return a mock embedding
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock') {
    return generateMockEmbedding(text);
  }
  
  const response = await getOpenAIClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  
  const embedding = response.data[0]?.embedding;
  if (!embedding) {
    throw new Error('Failed to generate embedding');
  }
  
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock') {
    return texts.map(t => generateMockEmbedding(t));
  }
  
  const response = await getOpenAIClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: texts,
  });
  
  return response.data.map(d => d.embedding);
}

/**
 * Generate a deterministic mock embedding for testing
 * Based on simple hash of the input text
 */
function generateMockEmbedding(text: string): number[] {
  const embedding = new Array(1536).fill(0);
  
  // Create a simple hash-based embedding for testing
  // This ensures similar-ish texts get similar-ish vectors
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const idx = (i * 7 + charCode) % 1536;
    embedding[idx] = (embedding[idx] + (charCode / 255) - 0.5) / 2;
  }
  
  // Normalize the vector
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = embedding[i]! / magnitude;
    }
  }
  
  return embedding;
}
