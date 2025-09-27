// Social Media Integration and NLP Service
// services/socialMediaService.js
const axios = require('axios');
const { HfInference } = require('@huggingface/inference');
const logger = require('../utils/logger');

class SocialMediaService {
  constructor() {
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.twitterBearer = process.env.TWITTER_BEARER_TOKEN;
    this.facebookToken = process.env.FACEBOOK_ACCESS_TOKEN;
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY;
  }

  // Gemini API integration for NLP
  async analyzeWithGemini(text, task = 'classification') {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.geminiApiKey}`,
        {
          contents: [{
            parts: [{
              text: `Analyze this social media post for ocean hazard content. 
                     Text: "${text}"
                     
                     Please provide:
                     1. Hazard classification (tsunami, high_waves, storm_surge, coastal_erosion, debris, pollution, none)
                     2. Severity level (low, medium, high, critical, none)
                     3. Sentiment score (-1 to 1)
                     4. Urgency level (routine, watch, warning, emergency)
                     5. Geographic relevance (coastal, inland, unknown)
                     
                     Respond in JSON format only.`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 500
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        const analysisText = response.data.candidates[0].content.parts[0].text;
        try {
          // Extract JSON from the response
          const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
          }
        } catch (parseError) {
          logger.warn('Failed to parse Gemini JSON response', parseError);
        }
      }

      // Fallback analysis
      return this.fallbackAnalysis(text);
    } catch (error) {
      logger.error('Gemini API error:', error);
      return this.fallbackAnalysis(text);
    }
  }

  // Fallback analysis using Hugging Face models
  async fallbackAnalysis(text) {
    try {
      const [classification, sentiment] = await Promise.all([
        this.classifyHazard(text),
        this.analyzeSentiment(text)
      ]);

      return {
        hazardType: classification.hazardType,
        severity: classification.severity,
        sentiment: sentiment.score,
        urgency: this.determineUrgency(text, classification.severity),
        geographic: this.analyzeGeographicRelevance(text)
      };
    } catch (error) {
      logger.error('Fallback analysis error:', error);
      return {
        hazardType: 'none',
        severity: 'none',
        sentiment: 0,
        urgency: 'routine',
        geographic: 'unknown'
      };
    }
  }

  // Twitter API integration
  async searchTweets(query, options = {}) {
    try {
      const params = new URLSearchParams({
        query: `${query} (tsunami OR "high waves" OR "storm surge" OR "coastal erosion" OR "ocean hazard") lang:en`,
        max_results: options.maxResults || 100,
        'tweet.fields': 'created_at,geo,public_metrics,context_annotations,lang',
        'user.fields': 'location,verified,public_metrics',
        expansions: 'author_id,geo.place_id'
      });

      if (options.since) {
        params.append('start_time', new Date(options.since).toISOString());
      }

      const response = await axios.get(
        `https://api.twitter.com/2/tweets/search/recent?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.twitterBearer}`
          }
        }
      );

      return this.processTweets(response.data);
    } catch (error) {
      logger.error('Twitter API error:', error);
      throw new Error('Failed to fetch tweets');
    }
  }

  async processTweets(twitterData) {
    const tweets = twitterData.data || [];
    const users = this.indexById(twitterData.includes?.users || []);
    const places = this.indexById(twitterData.includes?.places || []);

    const processedTweets = await Promise.all(
      tweets.map(async (tweet) => {
        const analysis = await this.analyzeWithGemini(tweet.text);
        const user = users[tweet.author_id] || {};
        const place = tweet.geo?.place_id ? places[tweet.geo.place_id] : null;

        return {
          platform: 'twitter',
          postId: tweet.id,
          content: tweet.text,
          author: {
            id: tweet.author_id,
            username: user.username,
            location: user.location,
            verified: user.verified,
            followers: user.public_metrics?.followers_count
          },
          location: place ? {
            name: place.full_name,
            coordinates: place.geo?.bbox ? this.calculateCenter(place.geo.bbox) : null
          } : null,
          timestamp: new Date(tweet.created_at),
          metrics: {
            retweets: tweet.public_metrics?.retweet_count || 0,
            likes: tweet.public_metrics?.like_count || 0,
            replies: tweet.public_metrics?.reply_count || 0
          },
          analysis: {
            hazardType: analysis.hazardType,
            severity: analysis.severity,
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            geographic: analysis.geographic,
            relevanceScore: this.calculateRelevanceScore(analysis, tweet)
          }
        };
      })
    );

    return processedTweets.filter(tweet => 
      tweet.analysis.hazardType !== 'none' && 
      tweet.analysis.relevanceScore > 0.3
    );
  }

  // Facebook API integration
  async searchFacebookPosts(query, options = {}) {
    try {
      // Facebook Graph API for public posts
      const params = new URLSearchParams({
        q: `${query} ocean hazard tsunami waves`,
        type: 'post',
        limit: options.maxResults || 50,
        fields: 'id,message,created_time,from,place,likes.summary(true),comments.summary(true),shares'
      });

      if (options.since) {
        params.append('since', Math.floor(new Date(options.since).getTime() / 1000));
      }

      const response = await axios.get(
        `https://graph.facebook.com/v18.0/search?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${this.facebookToken}`
          }
        }
      );

      return this.processFacebookPosts(response.data.data || []);
    } catch (error) {
      logger.error('Facebook API error:', error);
      throw new Error('Failed to fetch Facebook posts');
    }
  }

  async processFacebookPosts(posts) {
    const processedPosts = await Promise.all(
      posts.map(async (post) => {
        if (!post.message) return null;

        const analysis = await this.analyzeWithGemini(post.message);

        return {
          platform: 'facebook',
          postId: post.id,
          content: post.message,
          author: {
            id: post.from?.id,
            name: post.from?.name
          },
          location: post.place ? {
            name: post.place.name,
            coordinates: post.place.location ? [
              post.place.location.longitude,
              post.place.location.latitude
            ] : null
          } : null,
          timestamp: new Date(post.created_time),
          metrics: {
            likes: post.likes?.summary?.total_count || 0,
            comments: post.comments?.summary?.total_count || 0,
            shares: post.shares?.count || 0
          },
          analysis: {
            hazardType: analysis.hazardType,
            severity: analysis.severity,
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            geographic: analysis.geographic,
            relevanceScore: this.calculateRelevanceScore(analysis, post)
          }
        };
      })
    );

    return processedPosts
      .filter(post => 
        post && 
        post.analysis.hazardType !== 'none' && 
        post.analysis.relevanceScore > 0.3
      );
  }

  // YouTube API integration
  async searchYouTubeComments(query, options = {}) {
    try {
      // First, search for videos
      const videoParams = new URLSearchParams({
        part: 'snippet',
        q: `${query} ocean tsunami waves hazard`,
        type: 'video',
        maxResults: options.maxVideos || 20,
        publishedAfter: options.since ? new Date(options.since).toISOString() : 
                        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        key: this.youtubeApiKey
      });

      const videosResponse = await axios.get(
        `https://www.googleapis.com/youtube/v3/search?${videoParams}`
      );

      const videoIds = videosResponse.data.items.map(item => item.id.videoId);
      
      // Get comments for these videos
      const allComments = [];
      for (const videoId of videoIds) {
        try {
          const comments = await this.getVideoComments(videoId, options.maxCommentsPerVideo || 50);
          allComments.push(...comments);
        } catch (error) {
          logger.warn(`Failed to get comments for video ${videoId}:`, error.message);
        }
      }

      return allComments;
    } catch (error) {
      logger.error('YouTube API error:', error);
      throw new Error('Failed to fetch YouTube comments');
    }
  }

  async getVideoComments(videoId, maxResults = 50) {
    const params = new URLSearchParams({
      part: 'snippet',
      videoId: videoId,
      maxResults: maxResults,
      order: 'relevance',
      textFormat: 'plainText',
      key: this.youtubeApiKey
    });

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/commentThreads?${params}`
    );

    const comments = response.data.items || [];
    
    const processedComments = await Promise.all(
      comments.map(async (comment) => {
        const snippet = comment.snippet.topLevelComment.snippet;
        const analysis = await this.analyzeWithGemini(snippet.textDisplay);

        return {
          platform: 'youtube',
          postId: comment.id,
          content: snippet.textDisplay,
          author: {
            name: snippet.authorDisplayName,
            profileImageUrl: snippet.authorProfileImageUrl
          },
          timestamp: new Date(snippet.publishedAt),
          videoId: videoId,
          metrics: {
            likes: snippet.likeCount || 0
          },
          analysis: {
            hazardType: analysis.hazardType,
            severity: analysis.severity,
            sentiment: analysis.sentiment,
            urgency: analysis.urgency,
            geographic: analysis.geographic,
            relevanceScore: this.calculateRelevanceScore(analysis, { text: snippet.textDisplay })
          }
        };
      })
    );

    return processedComments.filter(comment => 
      comment.analysis.hazardType !== 'none' && 
      comment.analysis.relevanceScore > 0.3
    );
  }

  // Helper methods
  async classifyHazard(text) {
    try {
      const result = await this.hf.textClassification({
        model: 'distilbert-base-uncased',
        inputs: text
      });

      // Map results to hazard types (simplified)
      const keywords = text.toLowerCase();
      let hazardType = 'none';
      let severity = 'none';

      if (keywords.includes('tsunami')) {
        hazardType = 'tsunami';
        severity = keywords.includes('warning') || keywords.includes('alert') ? 'critical' : 'high';
      } else if (keywords.includes('waves') || keywords.includes('surge')) {
        hazardType = 'high_waves';
        severity = 'medium';
      } else if (keywords.includes('storm') || keywords.includes('hurricane')) {
        hazardType = 'storm_surge';
        severity = 'high';
      } else if (keywords.includes('erosion')) {
        hazardType = 'coastal_erosion';
        severity = 'low';
      } else if (keywords.includes('debris') || keywords.includes('trash')) {
        hazardType = 'debris';
        severity = 'low';
      } else if (keywords.includes('pollution') || keywords.includes('oil')) {
        hazardType = 'pollution';
        severity = 'medium';
      }

      return { hazardType, severity };
    } catch (error) {
      logger.error('Hazard classification error:', error);
      return { hazardType: 'none', severity: 'none' };
    }
  }

  async analyzeSentiment(text) {
    try {
      const result = await this.hf.textClassification({
        model: 'cardiffnlp/twitter-roberta-base-sentiment-latest',
        inputs: text
      });

      // Convert to numeric score
      const sentiment = result[0];
      let score = 0;
      
      if (sentiment.label === 'NEGATIVE') {
        score = -sentiment.score;
      } else if (sentiment.label === 'POSITIVE') {
        score = sentiment.score;
      }

      return { score, label: sentiment.label };
    } catch (error) {
      logger.error('Sentiment analysis error:', error);
      return { score: 0, label: 'NEUTRAL' };
    }
  }

  determineUrgency(text, severity) {
    const urgentKeywords = ['emergency', 'urgent', 'immediate', 'warning', 'alert', 'evacuation'];
    const hasUrgentKeywords = urgentKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    if (hasUrgentKeywords || severity === 'critical') return 'emergency';
    if (severity === 'high') return 'warning';
    if (severity === 'medium') return 'watch';
    return 'routine';
  }

  analyzeGeographicRelevance(text) {
    const coastalKeywords = ['coast', 'beach', 'shore', 'harbor', 'port', 'marina', 'ocean', 'sea'];
    const hasCoastalKeywords = coastalKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );

    return hasCoastalKeywords ? 'coastal' : 'unknown';
  }

  calculateRelevanceScore(analysis, post) {
    let score = 0;

    // Hazard type relevance
    if (analysis.hazardType !== 'none') score += 0.4;
    
    // Severity relevance
    switch (analysis.severity) {
      case 'critical': score += 0.3; break;
      case 'high': score += 0.2; break;
      case 'medium': score += 0.1; break;
    }

    // Geographic relevance
    if (analysis.geographic === 'coastal') score += 0.2;

    // Engagement metrics (for social media posts)
    if (post.metrics) {
      const totalEngagement = (post.metrics.likes || 0) + 
                             (post.metrics.retweets || 0) + 
                             (post.metrics.comments || 0) + 
                             (post.metrics.shares || 0);
      if (totalEngagement > 10) score += 0.1;
      if (totalEngagement > 100) score += 0.1;
    }

    return Math.min(score, 1.0);
  }

  indexById(array) {
    return array.reduce((acc, item) => {
      acc[item.id] = item;
      return acc;
    }, {});
  }

  calculateCenter(bbox) {
    // bbox format: [west, south, east, north]
    return [
      (bbox[0] + bbox[2]) / 2, // longitude
      (bbox[1] + bbox[3]) / 2  // latitude
    ];
  }

  // Aggregate social media data
  async aggregateSocialMediaData(query, options = {}) {
    try {
      const results = await Promise.allSettled([
        this.searchTweets(query, options),
        this.searchFacebookPosts(query, options),
        this.searchYouTubeComments(query, options)
      ]);

      const allPosts = [];
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          allPosts.push(...result.value);
        } else {
          const platforms = ['Twitter', 'Facebook', 'YouTube'];
          logger.warn(`${platforms[index]} integration failed:`, result.reason);
        }
      });

      // Sort by relevance and timestamp
      return allPosts
        .sort((a, b) => {
          const relevanceDiff = b.analysis.relevanceScore - a.analysis.relevanceScore;
          if (relevanceDiff !== 0) return relevanceDiff;
          return new Date(b.timestamp) - new Date(a.timestamp);
        })
        .slice(0, options.maxResults || 200);
    } catch (error) {
      logger.error('Social media aggregation error:', error);
      throw error;
    }
  }
}

module.exports = new SocialMediaService();