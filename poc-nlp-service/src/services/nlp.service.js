/**
 * NLP Core Service
 * Handles text processing, analysis, and natural language operations
 */

const natural = require('natural');
const compromise = require('compromise');
const Sentiment = require('sentiment');
const logger = require('../utils/logger');
const config = require('../config/config');

class NLPService {
  constructor() {
    this.sentiment = new Sentiment();
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    this.tfidf = new natural.TfIdf();
    
    // Initialize language processing
    this.initializeProcessors();
  }

  initializeProcessors() {
    // Set up language processing components
    natural.LancasterStemmer.attach();
    
    logger.info('NLP Service initialized with processors', {
      tokenizer: 'WordTokenizer',
      stemmer: 'PorterStemmer',
      sentiment: 'Sentiment',
      nlp: 'Compromise'
    });
  }

  /**
   * Process text with comprehensive NLP analysis
   */
  async processText(text, options = {}) {
    try {
      if (!text || typeof text !== 'string') {
        throw new Error('Valid text input is required');
      }

      if (text.length > config.nlp.maxTextLength) {
        throw new Error(`Text exceeds maximum length of ${config.nlp.maxTextLength} characters`);
      }

      logger.debug('Processing text', { 
        textLength: text.length,
        options 
      });

      const startTime = Date.now();
      
      // Comprehensive text analysis
      const result = {
        original: text,
        processed: {
          normalized: this.normalizeText(text),
          tokens: this.tokenize(text),
          stems: this.stemText(text),
          pos: this.getPartOfSpeech(text),
          entities: this.extractEntities(text),
          sentiment: this.analyzeSentiment(text),
          keywords: this.extractKeywords(text),
          readability: this.calculateReadability(text),
          language: this.detectLanguage(text)
        },
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      logger.debug('Text processing completed', {
        processingTime: result.metadata.processingTime,
        tokenCount: result.processed.tokens.length,
        entityCount: result.processed.entities.length
      });

      return {
        success: true,
        data: result
      };

    } catch (error) {
      logger.error('Error processing text', {
        error: error.message,
        textLength: text?.length || 0
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Normalize text for processing
   */
  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();
  }

  /**
   * Tokenize text into words
   */
  tokenize(text) {
    return this.tokenizer.tokenize(text);
  }

  /**
   * Stem text tokens
   */
  stemText(text) {
    const tokens = this.tokenize(text);
    return tokens.map(token => this.stemmer.stem(token));
  }

  /**
   * Get part-of-speech tags
   */
  getPartOfSpeech(text) {
    const doc = compromise(text);
    return doc.out('tags');
  }

  /**
   * Extract named entities
   */
  extractEntities(text) {
    const doc = compromise(text);
    
    const entities = {
      people: [],
      places: [],
      organizations: [],
      dates: [],
      money: [],
      numbers: []
    };

    if (config.nlp.entities.enablePersons) {
      entities.people = doc.people().out('array');
    }

    if (config.nlp.entities.enableLocations) {
      entities.places = doc.places().out('array');
    }

    if (config.nlp.entities.enableOrganizations) {
      entities.organizations = doc.organizations().out('array');
    }

    if (config.nlp.entities.enableDates) {
      entities.dates = doc.dates().out('array');
    }

    if (config.nlp.entities.enableNumbers) {
      entities.money = doc.money().out('array');
      entities.numbers = doc.values().out('array');
    }

    return entities;
  }

  /**
   * Analyze sentiment
   */
  analyzeSentiment(text) {
    const result = this.sentiment.analyze(text);
    
    let classification = 'neutral';
    if (result.score > config.nlp.sentiment.positive) {
      classification = 'positive';
    } else if (result.score < config.nlp.sentiment.negative) {
      classification = 'negative';
    }

    return {
      score: result.score,
      comparative: result.comparative,
      classification,
      positive: result.positive,
      negative: result.negative,
      tokens: result.tokens
    };
  }

  /**
   * Extract keywords using TF-IDF
   */
  extractKeywords(text, limit = 10) {
    const normalized = this.normalizeText(text);
    this.tfidf.addDocument(normalized);
    
    const keywords = [];
    this.tfidf.listTerms(0).slice(0, limit).forEach(item => {
      keywords.push({
        term: item.term,
        score: item.tfidf
      });
    });

    return keywords;
  }

  /**
   * Calculate readability metrics
   */
  calculateReadability(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = this.tokenize(text);
    const syllables = words.reduce((count, word) => {
      return count + this.countSyllables(word);
    }, 0);

    // Flesch Reading Ease Score
    const avgSentenceLength = words.length / sentences.length;
    const avgSyllablesPerWord = syllables / words.length;
    const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);

    return {
      sentences: sentences.length,
      words: words.length,
      syllables,
      avgSentenceLength: Math.round(avgSentenceLength * 100) / 100,
      avgSyllablesPerWord: Math.round(avgSyllablesPerWord * 100) / 100,
      fleschScore: Math.round(fleschScore * 100) / 100,
      readingLevel: this.getReadingLevel(fleschScore)
    };
  }

  /**
   * Count syllables in a word
   */
  countSyllables(word) {
    word = word.toLowerCase();
    if (word.length <= 3) return 1;
    
    const vowels = 'aeiouy';
    let count = 0;
    let previousWasVowel = false;
    
    for (let i = 0; i < word.length; i++) {
      const isVowel = vowels.includes(word[i]);
      if (isVowel && !previousWasVowel) {
        count++;
      }
      previousWasVowel = isVowel;
    }
    
    if (word.endsWith('e')) count--;
    return Math.max(1, count);
  }

  /**
   * Get reading level from Flesch score
   */
  getReadingLevel(score) {
    if (score >= 90) return 'Very Easy';
    if (score >= 80) return 'Easy';
    if (score >= 70) return 'Fairly Easy';
    if (score >= 60) return 'Standard';
    if (score >= 50) return 'Fairly Difficult';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
  }

  /**
   * Detect language (simplified implementation)
   */
  detectLanguage(text) {
    // Simple language detection based on common words
    const englishWords = ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it'];
    const words = this.tokenize(text.toLowerCase());
    const englishMatches = words.filter(word => englishWords.includes(word)).length;
    
    const confidence = englishMatches / Math.min(words.length, 20);
    
    return {
      language: confidence > 0.1 ? 'en' : 'unknown',
      confidence: Math.round(confidence * 100) / 100
    };
  }

  /**
   * Analyze text structure
   */
  async analyzeStructure(text) {
    try {
      const doc = compromise(text);
      
      return {
        success: true,
        data: {
          sentences: doc.sentences().length,
          clauses: doc.clauses().length,
          phrases: doc.phrases().length,
          nouns: doc.nouns().out('array'),
          verbs: doc.verbs().out('array'),
          adjectives: doc.adjectives().out('array'),
          adverbs: doc.adverbs().out('array'),
          questions: doc.questions().out('array'),
          statements: doc.statements().out('array')
        }
      };
    } catch (error) {
      logger.error('Error analyzing text structure', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get service health and statistics
   */
  getServiceHealth() {
    return {
      status: 'healthy',
      capabilities: [
        'Text Normalization',
        'Tokenization',
        'Stemming',
        'Part-of-Speech Tagging',
        'Named Entity Recognition',
        'Sentiment Analysis',
        'Keyword Extraction',
        'Readability Analysis',
        'Language Detection',
        'Text Structure Analysis'
      ],
      configuration: {
        maxTextLength: config.nlp.maxTextLength,
        defaultLanguage: config.nlp.defaultLanguage,
        entitiesEnabled: config.nlp.entities
      },
      performance: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    };
  }
}

module.exports = new NLPService();