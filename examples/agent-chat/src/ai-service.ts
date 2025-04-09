import { Message } from './chat-room.js';
import { experimental_buildAnthropicStream } from 'ai/streams';
import { z } from 'zod';

// Environment variable validation schema
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required")
});

// Validate environment variables
try {
  EnvSchema.parse(process.env);
} catch (error) {
  throw new Error('Missing or invalid environment variables', { 
    cause: error instanceof z.ZodError ? error.errors : error 
  });
}

// Message schema for validation
const AIMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1, "Message content cannot be empty")
});

export type AIMessage = z.infer<typeof AIMessageSchema>;

/**
 * Service for interacting with AI using Anthropic through Vercel AI SDK
 * Implements singleton pattern for managing conversation history
 */
export class AIService {
  static #instance: AIService | null = null;
  readonly #conversationHistory: Map<string, AIMessage[]>;
  
  // Configuration constants
  readonly #maxHistory = 10;
  readonly #maxTokens = 1024;
  readonly #maxRetries = 3;
  readonly #retryDelay = 1000; // milliseconds
  readonly #model = 'claude-3-opus-20240229';
  readonly #systemPrompt = "You are Claude, an AI assistant in a chat room. Be helpful, concise, and engaging. If asked about code, provide specific, practical solutions.";
  
  private constructor() {
    this.#conversationHistory = new Map();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): AIService {
    if (!AIService.#instance) {
      AIService.#instance = new AIService();
    }
    return AIService.#instance;
  }
  
  /**
   * Get conversation history for a room
   * @private
   */
  #getConversationHistory(roomId: string): AIMessage[] {
    if (!this.#conversationHistory.has(roomId)) {
      this.#conversationHistory.set(roomId, []);
    }
    return this.#conversationHistory.get(roomId)!;
  }

  /**
   * Sleep for a specified duration
   * @private
   */
  async #sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Process a message with AI
   * @throws {Error} If the API call fails or message format is invalid
   */
  public async processMessage(message: Message, roomId: string): Promise<string> {
    const history = this.#getConversationHistory(roomId);
    const userContent = message.content.replace(/@claude/i, '').trim();
    
    // Create and validate user message
    const userMessage: AIMessage = {
      role: 'user',
      content: userContent
    };
    
    try {
      AIMessageSchema.parse(userMessage);
    } catch (error) {
      throw new Error('Invalid message format', { 
        cause: error instanceof z.ZodError ? error.errors : error 
      });
    }
    
    // Add user message to history
    history.push(userMessage);
    
    let lastError: Error | null = null;
    
    // Retry loop for API calls
    for (let attempt = 1; attempt <= this.#maxRetries; attempt++) {
      try {
        // Format conversation history for Claude
        const messages = [
          { role: 'system', content: this.#systemPrompt },
          ...history.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        ];
        
        // Create Anthropic stream
        const stream = await experimental_buildAnthropicStream({
          messages,
          model: this.#model,
          maxTokens: this.#maxTokens,
          apiKey: process.env.ANTHROPIC_API_KEY!,
          systemPrompt: this.#systemPrompt
        });

        // Read the stream to completion
        let aiResponse = '';
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          aiResponse += value;
        }
        
        if (!aiResponse) {
          throw new Error('Empty response from AI');
        }
        
        // Add AI's response to history
        const assistantMessage: AIMessage = {
          role: 'assistant',
          content: aiResponse
        };
        
        AIMessageSchema.parse(assistantMessage);
        history.push(assistantMessage);
        
        // Maintain history limit
        if (history.length > this.#maxHistory) {
          history.splice(0, history.length - this.#maxHistory);
        }
        
        return aiResponse;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // If this was the last attempt, throw the error
        if (attempt === this.#maxRetries) {
          throw new Error('Failed to get response from AI after multiple attempts', { 
            cause: lastError 
          });
        }
        
        // Wait before retrying
        await this.#sleep(this.#retryDelay * attempt);
      }
    }
    
    // This should never happen due to the throw in the loop
    throw new Error('Failed to get response from AI', { cause: lastError });
  }
  
  /**
   * Clear conversation history for a room
   */
  public clearHistory(roomId: string): void {
    this.#conversationHistory.delete(roomId);
  }
  
  /**
   * Get the number of messages in a room's history
   */
  public getHistoryLength(roomId: string): number {
    return this.#getConversationHistory(roomId).length;
  }

  /**
   * Get the current configuration
   */
  public getConfig(): {
    maxHistory: number;
    maxTokens: number;
    model: string;
  } {
    return {
      maxHistory: this.#maxHistory,
      maxTokens: this.#maxTokens,
      model: this.#model
    };
  }
} 